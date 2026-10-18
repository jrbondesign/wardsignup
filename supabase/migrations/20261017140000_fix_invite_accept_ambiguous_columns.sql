-- Fix ambiguous column references in invite acceptance functions
--
-- Bug: accept_organization_invite RETURNS TABLE with organization_id as an OUT parameter,
-- creating ambiguity with unqualified organization_id column references in queries.
-- ERROR 42702: column reference "organization_id" is ambiguous
--
-- Fix: Add #variable_conflict use_column directive and fully qualify all column references
-- with table aliases throughout both functions.

-- Recreate validate_and_get_invite with fully qualified column references
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
#variable_conflict use_column
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
        END AS masked_invited_email,
        o.name AS organization_name,
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
        END AS inviter_display_name
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

-- Recreate accept_organization_invite with fully qualified column references
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
#variable_conflict use_column
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
    SELECT u.email, u.email_confirmed_at
    INTO v_user_email, v_email_confirmed_at
    FROM auth.users u
    WHERE u.id = v_uid;

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
    -- CRITICAL: Fully qualify organization_id to avoid ambiguity with OUT parameter
    SELECT om.id INTO v_existing_member_id
    FROM public.organization_members om
    WHERE om.organization_id = v_invite.organization_id
      AND om.user_id = v_uid
      AND om.status = 'accepted'
      AND om.id <> v_invite.id;

    IF v_existing_member_id IS NOT NULL THEN
        -- Mark invite as accepted but note user was already a member
        -- Clear BOTH token fields (plaintext and hash) to prevent reuse
        UPDATE public.organization_members om
        SET
            user_id = v_uid,
            status = 'accepted',
            accepted_at = NOW(),
            accept_token = NULL,
            accept_token_hash = NULL,
            token_expires_at = NULL
        WHERE om.id = v_invite.id;

        RETURN QUERY SELECT
            v_invite.organization_id,
            v_invite.name,
            FALSE,
            TRUE;
        RETURN;
    END IF;

    -- Accept the invite (clear both token fields to prevent reuse)
    UPDATE public.organization_members om
    SET
        user_id = v_uid,
        status = 'accepted',
        accepted_at = NOW(),
        accept_token = NULL,
        accept_token_hash = NULL,
        token_expires_at = NULL
    WHERE om.id = v_invite.id;

    -- Handle ownership transfer if requested
    -- Inline the transfer logic (can't call transfer_organization_ownership because
    -- it requires auth.uid() = current owner, but we're running as the invitee)
    IF v_invite.transfer_on_accept THEN
        DECLARE
            v_current_owner UUID;
            v_old_owner_member_id UUID;
        BEGIN
            -- Get current owner
            SELECT o.owner_id INTO v_current_owner
            FROM public.organizations o
            WHERE o.id = v_invite.organization_id;

            IF v_current_owner IS NULL THEN
                RAISE EXCEPTION 'Organization not found for transfer' USING ERRCODE = 'P0002';
            END IF;

            IF v_current_owner = v_uid THEN
                RAISE EXCEPTION 'Target user is already the owner' USING ERRCODE = '22023';
            END IF;

            -- Get old owner's member row
            SELECT om.id INTO v_old_owner_member_id
            FROM public.organization_members om
            WHERE om.organization_id = v_invite.organization_id
              AND om.user_id = v_current_owner
              AND om.role = 'owner'
              AND om.status = 'accepted';

            IF v_old_owner_member_id IS NULL THEN
                RAISE EXCEPTION 'Current owner has no owner membership row' USING ERRCODE = 'P0002';
            END IF;

            -- Demote old owner to admin (frees the unique index: one accepted owner per org)
            UPDATE public.organization_members om
            SET role = 'admin'
            WHERE om.id = v_old_owner_member_id;

            -- Promote new owner (the invitee we just accepted)
            UPDATE public.organization_members om
            SET role = 'owner'
            WHERE om.id = v_invite.id;

            -- Update org owner_id
            UPDATE public.organizations o
            SET owner_id = v_uid
            WHERE o.id = v_invite.organization_id;

            v_ownership_transferred := TRUE;
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
