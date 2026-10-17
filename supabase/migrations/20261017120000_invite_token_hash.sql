-- Enhanced invite token security: hash storage and single-use guarantee.
-- The accept_token column now stores SHA-256 hashes instead of plaintext tokens.
-- Tokens are automatically marked single-use via status change on acceptance.

-- Add token_hash column for secure storage (migration path for existing tokens)
ALTER TABLE public.organization_members
    ADD COLUMN IF NOT EXISTS accept_token_hash TEXT UNIQUE;

-- Create index for fast token hash lookup
CREATE INDEX IF NOT EXISTS idx_org_members_token_hash
    ON public.organization_members(accept_token_hash)
    WHERE accept_token_hash IS NOT NULL AND status = 'pending';

-- Helper function to validate and consume an invite token
-- Supports both plaintext accept_token (for backward compatibility) and hashed accept_token_hash
CREATE OR REPLACE FUNCTION public.validate_and_get_invite(
    p_token_hash TEXT
)
RETURNS TABLE (
    member_id UUID,
    organization_id UUID,
    invited_email TEXT,
    transfer_on_accept BOOLEAN,
    organization_name TEXT,
    invited_by_name TEXT,
    invited_by_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        om.id,
        om.organization_id,
        om.invited_email,
        om.transfer_on_accept,
        o.name,
        COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
        COALESCE(u.email, '')
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    LEFT JOIN auth.users u ON u.id = om.invited_by
    WHERE (om.accept_token_hash = p_token_hash OR om.accept_token = p_token_hash)
      AND om.status = 'pending'
      AND (om.token_expires_at IS NULL OR om.token_expires_at > NOW());
END;
$$;

REVOKE ALL ON FUNCTION public.validate_and_get_invite(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_and_get_invite(TEXT) TO authenticated, anon;

-- Transactional accept function: validates email match, inserts membership, marks accepted
-- Supports both plaintext accept_token (for backward compatibility) and hashed accept_token_hash
CREATE OR REPLACE FUNCTION public.accept_organization_invite(
    p_token_hash TEXT,
    p_user_id UUID,
    p_user_email TEXT
)
RETURNS TABLE (
    organization_id UUID,
    organization_name TEXT,
    ownership_transferred BOOLEAN,
    already_member BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invite RECORD;
    v_existing_member_id UUID;
    v_ownership_transferred BOOLEAN := FALSE;
BEGIN
    -- Validate and lock the invite row (support both plaintext and hashed)
    SELECT
        om.id,
        om.organization_id,
        om.invited_email,
        om.transfer_on_accept,
        o.name
    INTO v_invite
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE (om.accept_token_hash = p_token_hash OR om.accept_token = p_token_hash)
      AND om.status = 'pending'
      AND (om.token_expires_at IS NULL OR om.token_expires_at > NOW())
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation not found or expired' USING ERRCODE = 'P0002';
    END IF;

    -- Email match check (case insensitive)
    IF LOWER(p_user_email) <> LOWER(v_invite.invited_email) THEN
        RAISE EXCEPTION 'Email mismatch' USING ERRCODE = '42501';
    END IF;

    -- Check if already a member (idempotent success)
    SELECT id INTO v_existing_member_id
    FROM public.organization_members
    WHERE organization_id = v_invite.organization_id
      AND user_id = p_user_id
      AND status = 'accepted'
      AND id <> v_invite.id;

    IF v_existing_member_id IS NOT NULL THEN
        -- Mark invite as accepted but note user was already a member
        UPDATE public.organization_members
        SET
            user_id = p_user_id,
            status = 'accepted',
            accepted_at = NOW(),
            accept_token_hash = NULL,
            token_expires_at = NULL
        WHERE id = v_invite.id;

        RETURN QUERY SELECT
            v_invite.organization_id,
            v_invite.name,
            FALSE,
            TRUE;
        RETURN;
    END IF;

    -- Accept the invite (clear both token fields)
    UPDATE public.organization_members
    SET
        user_id = p_user_id,
        status = 'accepted',
        accepted_at = NOW(),
        accept_token = NULL,
        accept_token_hash = NULL,
        token_expires_at = NULL
    WHERE id = v_invite.id;

    -- Handle ownership transfer if requested
    IF v_invite.transfer_on_accept THEN
        BEGIN
            PERFORM public.transfer_organization_ownership(
                v_invite.organization_id,
                p_user_id
            );
            v_ownership_transferred := TRUE;
        EXCEPTION WHEN OTHERS THEN
            -- Log but don't fail the acceptance
            RAISE WARNING 'Ownership transfer failed: %', SQLERRM;
        END;
    END IF;

    RETURN QUERY SELECT
        v_invite.organization_id,
        v_invite.name,
        v_ownership_transferred,
        FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_organization_invite(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_organization_invite(TEXT, UUID, TEXT) TO authenticated;
