"use client";

/**
 * Who is on the desk.
 *
 * The name is written into the audit trail of every card published from here,
 * as "score entered by X on behalf of Y", so it wants to be a person rather
 * than a role: the point of the line is that someone can be asked about it
 * afterwards.
 *
 * The PIN is what makes publishing deliberate. It is not a password and is not
 * treated as one; it defends against the accidental tap, not against a
 * determined person who is already standing at the club's own desk with the
 * scoring screen open. Leaving it unset is a legitimate choice for a small
 * club, and the screen says as much rather than nagging.
 */

import { useState } from "react";
import { Check, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setAdminPin, setDeskName, useSim } from "@/lib/sim/store";

export function DeskCard() {
  const deskName = useSim((s) => s.deskName);
  const adminPin = useSim((s) => s.adminPin);
  const [name, setName] = useState(deskName ?? "");
  const [pin, setPin] = useState("");
  const [saved, setSaved] = useState(false);

  const save = () => {
    setDeskName(name);
    if (pin.length >= 4) setAdminPin(pin);
    setPin("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <section className="rounded-2xl bg-card p-6 shadow-card">
      <p className="font-serif text-lg text-foreground">The desk</p>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        Who publishes cards entered on a player&apos;s behalf
      </p>

      <div className="mt-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Name on the desk</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Peter Kamau"
          />
          {/* Built as one string rather than text around an expression: JSX
              drops the space after an interpolation here, and the sentence is
              the whole point of the field. */}
          <p className="text-[12px] text-muted-foreground">
            {`Recorded against every card published here, as “score entered by ${
              name.trim() || "…"
            } on behalf of the player”.`}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Desk PIN</Label>
          <Input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder={adminPin ? "••••  (set, type to replace)" : "4 digits or more"}
          />
          <p className="text-[12px] text-muted-foreground">
            {adminPin
              ? "Asked for each time a card is published."
              : "Optional. Without one, publishing a card takes a single tap."}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="clay"
            disabled={!name.trim() && pin.length < 4}
            onClick={save}
          >
            {saved ? <Check className="size-4" /> : <KeyRound className="size-4" />}
            {saved ? "Saved" : "Save"}
          </Button>
          {adminPin && (
            <span className="text-[12px] text-muted-foreground">
              A PIN is set.
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
