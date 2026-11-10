CREATE OR REPLACE FUNCTION public.create_gift_card(p_serial_number text, p_voucher_code text, p_amount numeric)
RETURNS public.gift_cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_card public.gift_cards;
BEGIN
  IF NOT public.is_gift_card_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  IF p_serial_number IS NULL OR length(btrim(p_serial_number)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid serial number'; END IF;
  IF p_voucher_code IS NULL OR length(btrim(p_voucher_code)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid voucher code'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 999999999999.99 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  INSERT INTO public.gift_cards (serial_number, voucher_code, initial_amount, current_balance, status)
  VALUES (btrim(p_serial_number), btrim(p_voucher_code), p_amount, p_amount, 'active')
  RETURNING * INTO v_card;
  INSERT INTO public.transactions (gift_card_id, transaction_reference, transaction_type, amount, previous_balance, new_balance, description)
  VALUES (v_card.id, 'GC-' || upper(translate(gen_random_uuid()::text, '-', '')), 'initial_credit', p_amount, 0, p_amount, 'Initial card credit');
  RETURN v_card;
END;
$$;
REVOKE ALL ON FUNCTION public.create_gift_card(text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_gift_card(text, text, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.adjust_gift_card_balance(p_card_id uuid, p_amount numeric, p_adjustment text)
RETURNS public.gift_cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_card public.gift_cards; v_previous numeric(14,2); v_next numeric(14,2); v_type text;
BEGIN
  IF NOT public.is_gift_card_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 999999999999.99 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
  IF p_adjustment NOT IN ('add', 'deduct') THEN RAISE EXCEPTION 'Invalid adjustment'; END IF;
  SELECT * INTO v_card FROM public.gift_cards WHERE id = p_card_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card not found'; END IF;
  IF p_adjustment = 'deduct' AND v_card.status <> 'active' THEN RAISE EXCEPTION 'Only active cards can be charged'; END IF;
  v_previous := v_card.current_balance;
  v_next := CASE WHEN p_adjustment = 'add' THEN v_previous + p_amount ELSE v_previous - p_amount END;
  IF v_next < 0 THEN RAISE EXCEPTION 'Deduction exceeds available balance'; END IF;
  IF v_next > 999999999999.99 THEN RAISE EXCEPTION 'Balance exceeds supported limit'; END IF;
  v_type := CASE WHEN p_adjustment = 'add' THEN 'money_added' ELSE 'money_deducted' END;
  UPDATE public.gift_cards SET current_balance = v_next,
    status = CASE WHEN v_next = 0 THEN 'depleted' ELSE 'active' END
    WHERE id = p_card_id RETURNING * INTO v_card;
  INSERT INTO public.transactions (gift_card_id, transaction_reference, transaction_type, amount, previous_balance, new_balance, description)
  VALUES (p_card_id, 'GC-' || upper(translate(gen_random_uuid()::text, '-', '')), v_type, p_amount, v_previous, v_next,
    CASE WHEN p_adjustment = 'add' THEN 'Balance top-up' ELSE 'Balance deduction' END);
  RETURN v_card;
END;
$$;
REVOKE ALL ON FUNCTION public.adjust_gift_card_balance(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_gift_card_balance(uuid, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_gift_card_status(p_card_id uuid, p_active boolean)
RETURNS public.gift_cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_card public.gift_cards;
BEGIN
  IF NOT public.is_gift_card_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  UPDATE public.gift_cards SET status = CASE WHEN current_balance = 0 THEN 'depleted' WHEN p_active THEN 'active' ELSE 'inactive' END
  WHERE id = p_card_id RETURNING * INTO v_card;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card not found'; END IF;
  RETURN v_card;
END;
$$;
REVOKE ALL ON FUNCTION public.set_gift_card_status(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_gift_card_status(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_gift_card_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_gift_card_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'total_cards', (SELECT count(*) FROM public.gift_cards),
    'activated_cards', (SELECT count(*) FROM public.gift_cards WHERE status IN ('active', 'depleted')),
    'total_active_balance', COALESCE((SELECT sum(current_balance) FROM public.gift_cards WHERE status = 'active'), 0),
    'total_amount_added', COALESCE((SELECT sum(amount) FROM public.transactions WHERE transaction_type IN ('initial_credit', 'money_added')), 0),
    'total_amount_deducted', COALESCE((SELECT sum(amount) FROM public.transactions WHERE transaction_type = 'money_deducted'), 0)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_gift_card_dashboard_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gift_card_dashboard_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.provision_initial_gift_card_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF lower(NEW.email) = 'u.japheth@skymarts.com.ng' THEN
    INSERT INTO public.admins (id, email, role)
    VALUES (NEW.id, lower(NEW.email), 'admin')
    ON CONFLICT (email) DO UPDATE SET id = EXCLUDED.id, role = 'admin';
  ELSIF TG_OP = 'UPDATE' AND lower(OLD.email) = 'u.japheth@skymarts.com.ng' THEN
    DELETE FROM public.admins WHERE id = OLD.id AND lower(email) = 'u.japheth@skymarts.com.ng';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.provision_initial_gift_card_admin() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER provision_initial_gift_card_admin
AFTER INSERT OR UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.provision_initial_gift_card_admin();