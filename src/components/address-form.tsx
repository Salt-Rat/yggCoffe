"use client";
import { useState, type FormEvent } from "react";
import { useShop } from "./shop-provider";
export type Address = {
  id: string;
  recipient: string;
  postalCode: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
};
export const ADDRESS_FIELDS =
  "id recipient postalCode street number complement district city state";
export function AddressForm({
  onSaved,
  address,
}: {
  onSaved: (id: string) => void;
  address?: Address;
}) {
  const { api } = useShop();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const input = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const result = await api<{ saveAddress: string }>(
        "mutation($input:AddressInput!){saveAddress(input:$input)}",
        { input: { ...input, ...(address ? { id: address.id } : {}) } },
      );
      onSaved(result.saveAddress);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <label className="wide">
          Quem recebe
          <input
            name="recipient"
            defaultValue={address?.recipient}
            autoComplete="shipping name"
            required
            maxLength={120}
          />
        </label>
        <label>
          CEP · somente números
          <input
            name="postalCode"
            defaultValue={address?.postalCode}
            autoComplete="shipping postal-code"
            required
            pattern="[0-9]{8}"
            maxLength={8}
            inputMode="numeric"
          />
        </label>
        <label>
          UF
          <select name="state" required defaultValue={address?.state || "MG"}>
            {[
              "AC",
              "AL",
              "AP",
              "AM",
              "BA",
              "CE",
              "DF",
              "ES",
              "GO",
              "MA",
              "MT",
              "MS",
              "MG",
              "PA",
              "PB",
              "PR",
              "PE",
              "PI",
              "RJ",
              "RN",
              "RS",
              "RO",
              "RR",
              "SC",
              "SP",
              "SE",
              "TO",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="wide">
          Rua / avenida
          <input
            name="street"
            defaultValue={address?.street}
            autoComplete="shipping address-line1"
            required
            maxLength={150}
          />
        </label>
        <label>
          Número
          <input
            name="number"
            defaultValue={address?.number}
            required
            maxLength={20}
          />
        </label>
        <label>
          Complemento
          <input
            name="complement"
            defaultValue={address?.complement}
            autoComplete="shipping address-line2"
            maxLength={100}
          />
        </label>
        <label>
          Bairro
          <input
            name="district"
            defaultValue={address?.district}
            required
            maxLength={80}
          />
        </label>
        <label>
          Cidade
          <input
            name="city"
            defaultValue={address?.city}
            autoComplete="shipping address-level2"
            required
            maxLength={80}
          />
        </label>
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <button className="button" disabled={busy}>
        {busy ? "Salvando…" : "Salvar endereço"}
      </button>
    </form>
  );
}
