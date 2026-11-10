CREATE TABLE public.admins (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'admin' CHECK (role = 'admin'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admins TO authenticated;
GRANT ALL ON public.admins TO service_role;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.gift_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number text NOT NULL UNIQUE CHECK (length(btrim(serial_number)) BETWEEN 1 AND 100),
  voucher_code text NOT NULL UNIQUE CHECK (length(btrim(voucher_code)) BETWEEN 1 AND 200),
  initial_amount numeric(14,2) NOT NULL CHECK (initial_amount > 0),
  current_balance numeric(14,2) NOT NULL CHECK (current_balance >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'depleted')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gift_cards TO authenticated;
GRANT ALL ON public.gift_cards TO service_role;
ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_card_id uuid NOT NULL REFERENCES public.gift_cards(id) ON DELETE RESTRICT,
  transaction_reference text NOT NULL UNIQUE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('initial_credit', 'money_added', 'money_deducted')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  previous_balance numeric(14,2) NOT NULL CHECK (previous_balance >= 0),
  new_balance numeric(14,2) NOT NULL CHECK (new_balance >= 0),
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_gift_card_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins a
    WHERE a.id = (SELECT auth.uid()) AND a.role = 'admin'
  );
$$;
REVOKE ALL ON FUNCTION public.is_gift_card_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_gift_card_admin() TO authenticated;

CREATE POLICY "Admins read own authorization" ON public.admins FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
CREATE POLICY "Admins read gift cards" ON public.gift_cards FOR SELECT TO authenticated USING (public.is_gift_card_admin());
CREATE POLICY "Admins read transactions" ON public.transactions FOR SELECT TO authenticated USING (public.is_gift_card_admin());

CREATE OR REPLACE FUNCTION public.create_gift_card(p_serial_number text, p_voucher_code text, p_amount numeric)
RETURNS public.gift_cards
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_card public.gift_cards;
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
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_card public.gift_cards;
  v_previous numeric(14,2);
  v_next numeric(14,2);
  v_type text;
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
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_card public.gift_cards;
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

CREATE OR REPLACE FUNCTION public.reject_gift_card_transaction_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Transactions are immutable';
END;
$$;
CREATE TRIGGER gift_card_transactions_immutable
BEFORE UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.reject_gift_card_transaction_mutation();