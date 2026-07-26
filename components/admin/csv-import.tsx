"use client";

/**
 * CSV roster import — the one action that swaps the placeholder roster for
 * a pilot club's real members. Expected columns (order-free, matched by
 * header): first name, last name, email, member number, handicap index,
 * home club, gender, date of birth (optional).
 */

import { useRef, useState } from "react";
import { Check, Copy, FileUp, Mail, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { addRosterMember, useSim } from "@/lib/sim/store";
import type { Player } from "@/lib/types";

interface ParsedRow {
  name: string;
  email: string;
  memberNo: string;
  handicap: number;
  gender: "M" | "F";
  /** ISO yyyy-mm-dd; only needed for age-restricted events */
  dob?: string;
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  // naive quoted-field-aware split
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) {
        out.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };

  const header = split(lines[0]).map((h) => h.toLowerCase());
  const col = (...names: string[]) =>
    header.findIndex((h) => names.some((n) => h.includes(n)));
  const iFirst = col("first");
  const iLast = col("last");
  const iEmail = col("email");
  const iMember = col("member");
  const iHc = col("handicap", "index", "hi");
  const iGender = col("gender", "sex");
  const iDob = col("date of birth", "dob", "birth");

  return lines.slice(1).flatMap((line) => {
    const c = split(line);
    const first = iFirst >= 0 ? c[iFirst] : "";
    const last = iLast >= 0 ? c[iLast] : "";
    if (!first && !last) return [];
    const hc = parseFloat(iHc >= 0 ? c[iHc] : "");
    return [
      {
        name: `${first} ${last}`.trim(),
        email: iEmail >= 0 ? c[iEmail] : "",
        memberNo: iMember >= 0 ? c[iMember] : "",
        handicap: Number.isFinite(hc) ? Math.round(hc) : 18,
        gender: (iGender >= 0 ? c[iGender] : "M").toUpperCase().startsWith("F")
          ? ("F" as const)
          : ("M" as const),
        dob: normalizeDob(iDob >= 0 ? c[iDob] : ""),
      },
    ];
  });
}

/**
 * Accept the ways a club actually writes a date: 1978-04-12, 12/04/1978 and
 * 12-04-1978 all mean the same thing. Day first, because that is the local
 * convention. Anything unparseable is dropped rather than guessed at.
 */
function normalizeDob(raw: string): string | undefined {
  const v = (raw ?? "").trim();
  if (!v) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return undefined;
}

const TEMPLATE = `first name,last name,email,member number,handicap index,home club,gender,date of birth
Wanjiru,Kamande,wanjiru.kamande@example.com,M-1042,14.2,Muthaiga Golf Club,F,1978-04-12
Peter,Otieno,peter.otieno@example.com,M-0871,8.9,Muthaiga Golf Club,M,`;

export function CsvImportCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const rosterCount = useSim((s) => s.roster.length);
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [imported, setImported] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);
  const [invited, setInvited] = useState(false);

  const doImport = () => {
    if (!preview) return;
    for (const row of preview) {
      addRosterMember({
        id: `p-csv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        name: row.name,
        clubId: "muthaiga",
        handicap: row.handicap,
        gender: row.gender,
        email: row.email || undefined,
        memberNo: row.memberNo || undefined,
        dob: row.dob,
      } satisfies Player);
    }
    setImported(preview.length);
    setPreview(null);
  };

  return (
    <section className="rounded-2xl bg-card p-6 shadow-card">
      <div className="flex items-center gap-2">
        <p className="font-serif text-lg text-foreground">Members</p>
        <Badge variant="outline">{rosterCount} on the roster</Badge>
      </div>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        Import the club&apos;s real roster from a CSV, then invite everyone in
        one go
      </p>

      <div className="mt-5 flex flex-col gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const rows = parseCsv(await f.text());
            setPreview(rows);
            setImported(0);
            e.target.value = "";
          }}
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <FileUp className="size-4" />
            Import from CSV
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              const blob = new Blob([TEMPLATE], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "shimo-roster-template.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download template
          </Button>
        </div>

        {preview && (
          <div className="rounded-xl border border-clay/25 bg-clay-wash/40 p-4">
            <p className="text-[14px] font-medium text-foreground">
              {preview.length} member{preview.length === 1 ? "" : "s"} found
            </p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {preview
                .slice(0, 3)
                .map((r) => `${r.name} (HC ${r.handicap})`)
                .join(" · ")}
              {preview.length > 3 && ` · +${preview.length - 3} more`}
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="clay" onClick={doImport}>
                <Users className="size-3.5" />
                Add to roster
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {imported > 0 && (
          <div className="rounded-xl bg-secondary/50 p-4">
            <p className="flex items-center gap-1.5 text-[14px] font-medium text-foreground">
              <Check className="size-4 text-clay" />
              {imported} member{imported === 1 ? "" : "s"} added to the roster
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setInvited(true);
                  setTimeout(() => setInvited(false), 2500);
                }}
              >
                <Mail className="size-3.5" />
                {invited ? "Invites queued ✓" : "Bulk-invite by email"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      "https://shimo.golf/join/muthaiga-9F2K",
                    );
                  } catch {}
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2500);
                }}
              >
                <Copy className="size-3.5" />
                {linkCopied ? "Link copied ✓" : "Copy club join link"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
