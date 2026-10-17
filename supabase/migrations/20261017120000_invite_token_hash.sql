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

-- Helper function to validate and get masked invite info
-- Supports both plaintext accept_token (for backward compatibility) and hashed accept_token_hash
-- Returns only masked email and inviter display name (safe for anonymous callers)
CREATE OR REPLACE FUNCTION public.validate_and_get_invite(
    p_token_hash TEXT
)
RETURNS TABLE (
    masked_invited_email TEXT,
    organization_name TEXT,
    inviter_display_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_local TEXT;
    v_domain TEXT;
    v_inviter_name TEXT;
    v_inviter_email TEXT;
BEGIN
    RETURN QUERY
    SELECT
        -- Mask the invited email: j***@e***.com or j***@domain (for no-dot domains)
        CASE 
            WHEN POSITION('.' IN SPLIT_PART(om.invited_email, '@', 2)) > 0 THEN
                SUBSTRING(om.invited_email FROM 1 FOR 1) || '***@' || 
                SUBSTRING(SPLIT_PART(om.invited_email, '@', 2) FROM 1 FOR 1) || '***.' ||
                SUBSTRING(SPLIT_PART(om.invited_email, '@', 2) FROM POSITION('.' IN SPLIT_PART(om.invited_email, '@', 2)) + 1)
            ELSE
                SUBSTRING(om.invited_email FROM 1 FOR 1) || '***@' ||
                SUBSTRING(SPLIT_PART(om.invited_email, '@', 2) FROM 1 FOR 1) || '***'
        END,
        o.name,
        -- Inviter display: use name if available, otherwise masked email
        CASE 
            WHEN COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '') <> '' 
            THEN COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')
            WHEN u.email IS NOT NULL AND POSITION('.' IN SPLIT_PART(u.email, '@', 2)) > 0
            THEN SUBSTRING(u.email FROM 1 FOR 1) || '***@' || 
                 SUBSTRING(SPLIT_PART(u.email, '@', 2) FROM 1 FOR 1) || '***.' ||
                 SUBSTRING(SPLIT_PART(u.email, '@', 2) FROM POSITION('.' IN SPLIT_PART(u.email, '@', 2)) + 1)
            WHEN u.email IS NOT NULL
            THEN SUBSTRING(u.email FROM 1 FOR 1) || '***@' ||
                 SUBSTRING(SPLIT_PART(u.email, '@', 2) FROM 1 FOR 1) || '***'
            ELSE ''
        END
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    LEFT JOIN auth.users u ON u.id = om.invited_by
    WHERE (
        om.accept_token_hash = p_token_hash 
        OR (om.accept_token IS NOT NULL AND encode(extensions.digest(om.accept_token, 'sha256'), 'hex') = p_token_hash)
    )
      AND om.status = 'pending'
      AND (om.token_expires_at IS NULL OR om.token_expires_at > NOW());
END;
$$;

REVOKE ALL ON FUNCTION public.validate_and_get_invite(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_and_get_invite(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_and_get_invite(TEXT) TO authenticated, anon;

-- Transactional accept function: validates email match, inserts membership, marks accepted
-- Supports both plaintext accept_token (for backward compatibility) and hashed accept_token_hash
-- Security: uses auth.uid() and reads email from auth.users, never trusts client parameters
CREATE OR REPLACE FUNCTION public.accept_organization_invite(
    p_token_hash TEXT
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
    v_uid UUID;
    v_user_email TEXT;
    v_email_confirmed_at TIMESTAMPTZ;
    v_invite RECORD;
    v_existing_member_id UUID;
    v_ownership_transferred BOOLEAN := FALSE;
BEGIN
    -- Get authenticated user ID - fail if not authenticated
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    -- Read email and confirmation status from auth.users (authoritative source)
    SELECT email, email_confirmed_at
    INTO v_user_email, v_email_confirmed_at
    FROM auth.users
    WHERE id = v_uid;

    IF v_user_email IS NULL THEN
        RAISE EXCEPTION 'User email not found' USING ERRCODE = 'P0002';
    END IF;

    -- Require confirmed email
    IF v_email_confirmed_at IS NULL THEN
        RAISE EXCEPTION 'Email not confirmed' USING ERRCODE = '42501';
    END IF;

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
    WHERE (
        om.accept_token_hash = p_token_hash 
        OR (om.accept_token IS NOT NULL AND encode(extensions.digest(om.accept_token, 'sha256'), 'hex') = p_token_hash)
    )
      AND om.status = 'pending'
      AND (om.token_expires_at IS NULL OR om.token_expires_at > NOW())
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation not found or expired' USING ERRCODE = 'P0002';
    END IF;

    -- Email match check (case insensitive, using auth.users email)
    IF LOWER(v_user_email) <> LOWER(v_invite.invited_email) THEN
        RAISE EXCEPTION 'Email mismatch' USING ERRCODE = '42501';
    END IF;

    -- Check if already a member (idempotent success)
    SELECT id INTO v_existing_member_id
    FROM public.organization_members
    WHERE organization_id = v_invite.organization_id
      AND user_id = v_uid
      AND status = 'accepted'
      AND id <> v_invite.id;

    IF v_existing_member_id IS NOT NULL THEN
        -- Mark invite as accepted but note user was already a member
        -- Clear BOTH token fields (plaintext and hash) to prevent reuse
        UPDATE public.organization_members
        SET
            user_id = v_uid,
            status = 'accepted',
            accepted_at = NOW(),
            accept_token = NULL,
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

    -- Accept the invite (clear both token fields to prevent reuse)
    UPDATE public.organization_members
    SET
        user_id = v_uid,
        status = 'accepted',
        accepted_at = NOW(),
        accept_token = NULL,
        accept_token_hash = NULL,
        token_expires_at = NULL
    WHERE id = v_invite.id;

    -- Handle ownership transfer if requested (uses v_uid from auth)
    IF v_invite.transfer_on_accept THEN
        BEGIN
            PERFORM public.transfer_organization_ownership(
                v_invite.organization_id,
                v_uid
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

REVOKE ALL ON FUNCTION public.accept_organization_invite(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_organization_invite(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_organization_invite(TEXT) TO authenticated;
