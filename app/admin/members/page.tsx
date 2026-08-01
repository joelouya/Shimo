"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Send,
  UserMinus,
  UserPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEMO_USER_ID } from "@/lib/data";
import { addRosterMember, updateRosterMember, useSim } from "@/lib/sim/store";
import type { Player } from "@/lib/types";
import { initials } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { IS_PILOT } from "@/lib/mode";
import { invitePath } from "@/lib/membership";
import {
  ensureInviteToken,
  inviteAllMembers,
  inviteMember,
  linkMemberEmail,
  setMemberActive,
} from "@/lib/sim/store";

function roundsFor(p: Player) {
  return 8 + ((p.name.length * 7 + p.handicap * 3) % 26);
}

interface MemberForm {
  name: string;
  handicap: number;
  gender: "M" | "F";
  phone: string;
  email: string;
}

const EMPTY_FORM: MemberForm = {
  name: "",
  handicap: 18,
  gender: "M",
  phone: "+254 7",
  email: "",
};

/* ------------------------------------------------------------------ *
 * Membership access
 *
 * Pilot only. In demo anyone may look around, so an invitation column would
 * be a row of states that mean nothing.
 * ------------------------------------------------------------------ */

type AccessState = "active" | "invited" | "uninvited" | "off";

function accessOf(m: Player): AccessState {
  if (m.active === false) return "off";
  if (m.invite?.activatedAt) return "active";
  if (m.invite?.token) return "invited";
  return "uninvited";
}

const ACCESS_LABEL: Record<AccessState, string> = {
  active: "Active",
  invited: "Invited",
  uninvited: "Not invited",
  off: "Switched off",
};

function AccessBadge({ state }: { state: AccessState }) {
  if (state === "active")
    return (
      <Badge variant="secondary">
        <Check className="size-3" />
        Active
      </Badge>
    );
  if (state === "invited") return <Badge variant="outline">Invited</Badge>;
  if (state === "off") return <Badge variant="amber">Switched off</Badge>;
  return <Badge variant="outline">Not invited</Badge>;
}

/**
 * The per-member actions a club actually performs: send them their link, hand
 * it over by WhatsApp, attach the address they really use, or switch them off.
 */
function MemberMenu({
  m,
  onCopied,
  onLink,
}: {
  m: Player;
  onCopied: (name: string) => void;
  onLink: (m: Player) => void;
}) {
  const state = accessOf(m);
  const copyLink = async () => {
    const token = ensureInviteToken(m.id);
    if (!token) return;
    await navigator.clipboard.writeText(
      `${window.location.origin}${invitePath(token)}`,
    );
    onCopied(m.name);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Access for ${m.name}`}
          className="justify-self-end text-muted-foreground data-[state=open]:bg-secondary"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{ACCESS_LABEL[state]}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => inviteMember(m.id)}>
          <Send />
          {state === "uninvited" ? "Create invitation" : "Issue a new invitation"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={copyLink}>
          <Copy />
          Copy invitation link
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onLink(m)}>
          <Link2 />
          Link a different email
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {m.active === false ? (
          <DropdownMenuItem onSelect={() => setMemberActive(m.id, true)}>
            <UserPlus />
            Switch membership on
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setMemberActive(m.id, false)}
          >
            <UserMinus />
            Switch membership off
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function MembersPage() {
  const roster = useSim((s) => s.roster);
  const members = useMemo(
    () => roster.filter((p) => p.clubId === "muthaiga"),
    [roster],
  );
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Player | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<MemberForm>(EMPTY_FORM);
  const [copied, setCopied] = useState<string | null>(null);
  const [toLink, setToLink] = useState<Player | null>(null);
  const [linkEmail, setLinkEmail] = useState("");
  const [invited, setInvited] = useState<number | null>(null);

  const filtered = useMemo(
    () =>
      members.filter((m) =>
        m.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [members, query],
  );

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setAdding(true);
  };
  const openEdit = (p: Player) => {
    setForm({
      name: p.name,
      handicap: p.handicap,
      gender: p.gender,
      phone: p.phone ?? "",
      email: p.email ?? "",
    });
    setEditing(p);
  };

  const save = () => {
    if (editing) {
      updateRosterMember(editing.id, {
        ...form,
        handicap: Number(form.handicap),
      });
      setEditing(null);
    } else {
      addRosterMember({
        id: `p-new-${Date.now()}`,
        clubId: "muthaiga",
        ...form,
        handicap: Number(form.handicap),
      });
      setAdding(false);
    }
  };

  const dialogOpen = adding || !!editing;

  return (
    <div>
      <header className="flex items-end justify-between">
        <div>
          <p className="smallcaps text-clay">Members</p>
          <h1 className="mt-2 font-serif text-[34px] leading-tight text-foreground">
            The Muthaiga roster
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {members.length} playing members on Shimo · handicaps from the club
            roster
          </p>
        </div>
        {IS_PILOT && (
          <Button
            variant="outline"
            onClick={() => setInvited(inviteAllMembers())}
          >
            <Send className="size-4" />
            Invite everyone
          </Button>
        )}
        <Button variant="clay" onClick={openAdd}>
          <Plus className="size-4" />
          Add member
        </Button>
      </header>

      <div className="relative mt-7 max-w-sm">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search members…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl bg-card shadow-card">
        <div className="grid grid-cols-[2fr_5rem_1.6fr_6rem_6rem_3rem] items-center gap-3 border-b border-border bg-secondary/40 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Member</span>
          <span className="text-center">HC</span>
          <span>Contact</span>
          <span className="text-center">Rounds ’26</span>
          <span className="text-center">
            {IS_PILOT ? "Access" : "Tournaments"}
          </span>
          <span />
        </div>
        {filtered.map((m) => (
          <div
            key={m.id}
            className="grid grid-cols-[2fr_5rem_1.6fr_6rem_6rem_3rem] items-center gap-3 border-b border-border/50 px-5 py-3 last:border-b-0 transition-colors hover:bg-accent/40"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary font-serif text-[13px] text-ink-soft">
                {initials(m.name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium text-foreground">
                  {m.name}
                  {m.id === DEMO_USER_ID && (
                    <span className="ml-1.5 rounded bg-clay-wash px-1 py-px text-[9px] text-clay-deep">
                      demo user
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Member · {m.gender === "F" ? "Ladies" : "Men’s"} section
                </p>
              </div>
            </div>
            <p className="text-center font-serif text-[16px] text-foreground tnum">
              {m.handicap}
            </p>
            <div className="min-w-0">
              <p className="truncate text-[12px] text-ink-soft tnum">{m.phone}</p>
              <p className="truncate text-[11px] text-muted-foreground">{m.email}</p>
            </div>
            <p className="text-center text-[13px] text-ink-soft tnum">{roundsFor(m)}</p>
            {IS_PILOT ? (
              <div className="flex justify-center">
                <AccessBadge state={accessOf(m)} />
              </div>
            ) : (
              <p className="text-center text-[13px] text-ink-soft tnum">
                {Math.max(1, Math.round(roundsFor(m) / 3))}
              </p>
            )}
            {IS_PILOT ? (
              <MemberMenu m={m} onCopied={setCopied} onLink={setToLink} />
            ) : (
              <button
                onClick={() => openEdit(m)}
                className="justify-self-end rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
              >
                <Pencil className="size-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) {
            setAdding(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit member" : "Add member"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Changes apply to the roster immediately."
                : "New members can enter tournaments as soon as they’re added."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Full name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Alice Wambui"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Handicap index</Label>
                <Input
                  type="number"
                  min={0}
                  max={54}
                  value={form.handicap}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, handicap: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Section</Label>
                <Select
                  value={form.gender}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, gender: v as "M" | "F" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Men’s</SelectItem>
                    <SelectItem value="F">Ladies</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="clay"
              onClick={save}
              disabled={form.name.trim().length < 3}
            >
              {editing ? "Save changes" : "Add member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attaching the address a member actually uses. */}
      <Dialog
        open={!!toLink}
        onOpenChange={(o) => {
          if (!o) {
            setToLink(null);
            setLinkEmail("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link an email to {toLink?.name}</DialogTitle>
            <DialogDescription className="leading-relaxed">
              For when a member signs in with an address the club does not have
              on file. This marks them activated, because linking by hand is the
              identity check the invitation exists to perform. Only do it when
              you know who you are linking.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="link-email">Email they sign in with</Label>
            <Input
              id="link-email"
              type="email"
              value={linkEmail}
              placeholder="name@example.com"
              onChange={(e) => setLinkEmail(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setToLink(null)}>
              Cancel
            </Button>
            <Button
              variant="clay"
              disabled={!linkEmail.includes("@")}
              onClick={() => {
                if (toLink) linkMemberEmail(toLink.id, linkEmail);
                setToLink(null);
                setLinkEmail("");
              }}
            >
              <Link2 className="size-4" />
              Link this email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Two quiet confirmations. Neither is an error, so neither interrupts. */}
      <Dialog open={invited !== null} onOpenChange={() => setInvited(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {invited === 0
                ? "Everyone already has an invitation"
                : `${invited} invitation${invited === 1 ? "" : "s"} ready`}
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              {invited === 0
                ? "Every active member has either claimed their place or has a link waiting. Issue a new one from a member's menu if a link needs replacing."
                : "Members who had already claimed their place were left alone, so links that are in use keep working. Copy each link from the member's menu to send by WhatsApp."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="clay" onClick={() => setInvited(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!copied} onOpenChange={() => setCopied(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invitation link copied</DialogTitle>
            <DialogDescription className="leading-relaxed">
              Send it to {copied} and no one else. Anyone who opens it claims
              that membership, so treat it the way you would treat a key.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="clay" onClick={() => setCopied(null)}>
              Understood
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
