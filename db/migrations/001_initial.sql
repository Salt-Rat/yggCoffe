CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, email text NOT NULL UNIQUE,
 password_hash text NOT NULL, role text NOT NULL DEFAULT 'CUSTOMER' CHECK (role IN ('CUSTOMER','SUPPORT','ADMIN')),
 email_verified_at timestamptz, disabled_at timestamptz, mfa_secret text, mfa_last_step bigint NOT NULL DEFAULT -1,
 consent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 csrf_token text NOT NULL, user_agent_hash text NOT NULL, mfa_verified_at timestamptz,
 expires_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE action_tokens (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('VERIFY','RESET')), expires_at timestamptz NOT NULL
);
CREATE TABLE addresses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
 recipient text NOT NULL, postal_code text NOT NULL, street text NOT NULL, number text NOT NULL,
 complement text NOT NULL DEFAULT '', district text NOT NULL, city text NOT NULL, state text NOT NULL
);
CREATE INDEX addresses_owner ON addresses(user_id);
CREATE TABLE roast_profiles (
 id text PRIMARY KEY CHECK (id IN ('clara','media','escura')), name text NOT NULL,
 subtitle text NOT NULL, flavor text NOT NULL, acidity text NOT NULL, body text NOT NULL,
 sweetness text NOT NULL, bitterness text NOT NULL, preparation text NOT NULL,
 image_url text NOT NULL DEFAULT '/images/coffee-bean.png', origin text NOT NULL,
 description text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE homepage (
 id boolean PRIMARY KEY DEFAULT true CHECK (id), featured_roast text NOT NULL REFERENCES roast_profiles(id),
 month_label text NOT NULL, headline text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_index text NOT NULL UNIQUE, slug text NOT NULL UNIQUE,
 name text NOT NULL, description text NOT NULL, category text NOT NULL,
 roast_id text NOT NULL REFERENCES roast_profiles(id), image_url text NOT NULL,
 active boolean NOT NULL DEFAULT true, display_order integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_catalog ON products(active, display_order, id);
CREATE TABLE product_variants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products(id),
 sku text NOT NULL UNIQUE, label text NOT NULL, price_cents integer NOT NULL CHECK (price_cents BETWEEN 1 AND 10000000),
 stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0), reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= stock),
 active boolean NOT NULL DEFAULT true
);
CREATE INDEX variants_product ON product_variants(product_id);
CREATE TABLE cart_items (
 owner_key text NOT NULL, variant_id uuid NOT NULL REFERENCES product_variants(id),
 quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 20), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_key, variant_id)
);
CREATE TABLE orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
 idempotency_key uuid NOT NULL, request_hash text NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAID','PROCESSING','SHIPPED','DELIVERED','CANCELLED','EXPIRED','PAYMENT_REVIEW')),
 subtotal_cents integer NOT NULL CHECK(subtotal_cents >= 0), shipping_cents integer NOT NULL CHECK(shipping_cents >= 0),
 total_cents integer NOT NULL CHECK(total_cents = subtotal_cents + shipping_cents), currency text NOT NULL DEFAULT 'BRL',
 address_snapshot jsonb NOT NULL, provider text NOT NULL, provider_payment_id text, checkout_url text,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), tracking_code text,
 UNIQUE(user_id, idempotency_key), UNIQUE(provider, provider_payment_id)
);
CREATE INDEX orders_owner ON orders(user_id, created_at DESC);
CREATE INDEX orders_pending ON orders(expires_at) WHERE status='PENDING';
CREATE TABLE order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id),
 variant_id uuid NOT NULL REFERENCES product_variants(id), product_name text NOT NULL, sku text NOT NULL,
 quantity integer NOT NULL CHECK(quantity > 0), unit_price_cents integer NOT NULL CHECK(unit_price_cents > 0)
);
CREATE TABLE order_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id),
 status text NOT NULL, note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE payment_events (
 provider text NOT NULL, event_id text NOT NULL, order_id uuid NOT NULL REFERENCES orders(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(provider,event_id)
);
CREATE TABLE audit_logs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid REFERENCES users(id),
 action text NOT NULL, target_id text, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE rate_limits (
 key text PRIMARY KEY, count integer NOT NULL, reset_at timestamptz NOT NULL
);
CREATE INDEX rate_limits_expiry ON rate_limits(reset_at);
CREATE TABLE email_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipient text NOT NULL, subject text NOT NULL,
 encrypted_text text NOT NULL, dedupe_key text NOT NULL UNIQUE, attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
-- History/audit are append-only even when accidentally targeted by application UPDATE/DELETE.
CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'append-only table'; END; $$;
CREATE TRIGGER immutable_order_history BEFORE UPDATE OR DELETE ON order_history FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
