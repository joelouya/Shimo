/**
 * Row <-> store-shape conversions for the synced entities. Kept in one place
 * so the outbox push, the hydration read, and the realtime merge all agree on
 * the wire format.
 */

import type { AuditRecord } from "@/lib/integrity";
import type {
  Certification,
  CorrectionRequest,
  Dispute,
  SavedGroup,
} from "@/lib/sim/store";
import type { ClubIdentity, Player, Team, Tournament } from "@/lib/types";

/* ---- tournaments ---- */

export function tournamentToRow(t: Tournament) {
  return {
    id: t.id,
    club_id: t.clubId,
    course_id: t.courseId,
    name: t.name,
    date: t.date,
    format: t.format,
    entry_fee: t.entryFee,
    fee_tiers: t.feeTiers ?? null,
    sponsors: t.sponsors ?? null,
    contests: t.contests ?? null,
    event_kind: t.eventKind ?? null,
    presented_by: t.presentedBy ?? null,
    beneficiary: t.beneficiary ?? null,
    photos: t.photos ?? null,
    field_profile: t.fieldProfile ?? null,
    tv_quiet: t.tvQuiet ?? false,
    tv_coverage: t.tvCoverage ?? null,
    status: t.status,
    members_only: t.membersOnly,
    membership: t.membership ?? null,
    max_handicap: t.maxHandicap ?? null,
    min_handicap: t.minHandicap ?? null,
    min_age: t.minAge ?? null,
    max_age: t.maxAge ?? null,
    eligibility_note: t.eligibilityNote ?? null,
    ladies_only: t.ladiesOnly ?? false,
    divisions: t.divisions,
    description: t.description,
    prizes: t.prizes,
    max_players: t.maxPlayers,
    reg_closes: t.regCloses,
    reg_closes_at: t.regClosesAt ?? null,
    handicap_allowance: t.handicapAllowance,
    first_tee: t.firstTee,
    tee_interval: t.teeInterval,
    field_size: t.fieldSize,
    rounds: t.rounds ?? null,
    correction_window_min: t.correctionWindowMin ?? 15,
    players_per_team: t.playersPerTeam ?? null,
    handicap_allowances: t.handicapAllowances ?? null,
    max_course_handicap: t.maxCourseHandicap ?? null,
    max_course_handicap_differential: t.maxCourseHandicapDifferential ?? null,
    max_hole_score: t.maxHoleScore ?? null,
    ryder_cup: t.ryderCup ?? null,
    waitlist: t.waitlist ?? null,
    require_full_team: t.requireFullTeam ?? null,
    registration_questions: t.registrationQuestions ?? null,
    updated_at: new Date().toISOString(),
  };
}

export function rowToTournament(r: Record<string, unknown>): Tournament {
  return {
    id: r.id as string,
    clubId: r.club_id as string,
    courseId: r.course_id as string,
    name: r.name as string,
    date: r.date as string,
    format: r.format as Tournament["format"],
    entryFee: (r.entry_fee as number) ?? 0,
    feeTiers: (r.fee_tiers as Tournament["feeTiers"]) ?? undefined,
    sponsors: (r.sponsors as Tournament["sponsors"]) ?? undefined,
    contests: (r.contests as Tournament["contests"]) ?? undefined,
    eventKind: (r.event_kind as Tournament["eventKind"]) ?? undefined,
    presentedBy: (r.presented_by as Tournament["presentedBy"]) ?? undefined,
    beneficiary: (r.beneficiary as Tournament["beneficiary"]) ?? undefined,
    photos: (r.photos as Tournament["photos"]) ?? undefined,
    fieldProfile: (r.field_profile ?? undefined) as Tournament["fieldProfile"],
    tvQuiet: Boolean(r.tv_quiet),
    tvCoverage: (r.tv_coverage ?? undefined) as Tournament["tvCoverage"],
    status: r.status as Tournament["status"],
    membersOnly: Boolean(r.members_only),
    membership: (r.membership as Tournament["membership"]) ?? undefined,
    maxHandicap: (r.max_handicap as number) ?? undefined,
    minHandicap: (r.min_handicap as number) ?? undefined,
    minAge: (r.min_age as number) ?? undefined,
    maxAge: (r.max_age as number) ?? undefined,
    eligibilityNote: (r.eligibility_note as string) ?? undefined,
    ladiesOnly: Boolean(r.ladies_only),
    divisions: (r.divisions as Tournament["divisions"]) ?? [],
    description: (r.description as string) ?? "",
    prizes: (r.prizes as Tournament["prizes"]) ?? [],
    maxPlayers: (r.max_players as number) ?? 0,
    regCloses: (r.reg_closes as string) ?? "",
    regClosesAt: (r.reg_closes_at as string) ?? undefined,
    handicapAllowance: (r.handicap_allowance as number) ?? 95,
    firstTee: (r.first_tee as string) ?? "07:30",
    teeInterval: (r.tee_interval as number) ?? 10,
    fieldSize: (r.field_size as number) ?? 0,
    rounds: (r.rounds as Tournament["rounds"]) ?? undefined,
    correctionWindowMin: (r.correction_window_min as number) ?? 15,
    playersPerTeam: (r.players_per_team as number) ?? undefined,
    handicapAllowances: (r.handicap_allowances as number[]) ?? undefined,
    maxCourseHandicap: (r.max_course_handicap as number) ?? undefined,
    maxCourseHandicapDifferential:
      (r.max_course_handicap_differential as number) ?? undefined,
    maxHoleScore: (r.max_hole_score as Tournament["maxHoleScore"]) ?? undefined,
    ryderCup: (r.ryder_cup as Tournament["ryderCup"]) ?? undefined,
    waitlist: (r.waitlist as boolean) ?? undefined,
    requireFullTeam: (r.require_full_team as boolean) ?? undefined,
    registrationQuestions:
      (r.registration_questions as Tournament["registrationQuestions"]) ?? undefined,
  };
}

/* ---- pairings ---- */

export function pairingToRow(tournamentId: string, round: number, g: SavedGroup) {
  return {
    tournament_id: tournamentId,
    round,
    group_id: g.id,
    number: g.number,
    tee_time: g.teeTime,
    player_ids: g.playerIds,
    updated_at: new Date().toISOString(),
  };
}

export function rowToPairing(r: Record<string, unknown>): SavedGroup {
  return {
    id: r.group_id as string,
    number: r.number as number,
    teeTime: (r.tee_time as string) ?? "",
    playerIds: (r.player_ids as string[]) ?? [],
  };
}

/* ---- teams (a side that shares a result, distinct from a tee-time group) ---- */

export function teamToRow(tournamentId: string, round: number, t: Team) {
  return {
    tournament_id: tournamentId,
    round,
    team_id: t.id,
    name: t.name,
    player_ids: t.playerIds,
    division: t.division ?? null,
    updated_at: new Date().toISOString(),
  };
}

export function rowToTeam(r: Record<string, unknown>): Team {
  return {
    id: r.team_id as string,
    tournamentId: r.tournament_id as string,
    round: (r.round as number) ?? 1,
    name: (r.name as string) ?? "",
    playerIds: (r.player_ids as string[]) ?? [],
    division: (r.division as string) ?? undefined,
  };
}

/* ---- players (roster) ---- */

export function playerToRow(p: Player) {
  return {
    id: p.id,
    club_id: p.clubId,
    name: p.name,
    handicap: p.handicap,
    gender: p.gender,
    email: p.email ?? null,
    member_no: p.memberNo ?? null,
    dob: p.dob ?? null,
    invite_token: p.invite?.token ?? null,
    invite_sent_at: p.invite?.sentAt ?? null,
    invite_activated_at: p.invite?.activatedAt ?? null,
    invite_claimed_by: p.invite?.claimedBy ?? null,
    active: p.active !== false,
    is_guest: Boolean(p.guest),
    company: p.guest?.company ?? null,
    handicap_self_declared: p.guest?.selfDeclaredHandicap ?? false,
    guest_notes: p.guest?.notes ?? null,
    sponsor_list_consent: p.guest?.sponsorListConsent ?? false,
    updated_at: new Date().toISOString(),
  };
}

export function rowToPlayer(r: Record<string, unknown>): Player {
  return {
    id: r.id as string,
    clubId: r.club_id as string,
    name: r.name as string,
    handicap: Number(r.handicap),
    gender: (r.gender as "M" | "F") ?? "M",
    email: (r.email as string) ?? undefined,
    memberNo: (r.member_no as string) ?? undefined,
    dob: (r.dob as string) ?? undefined,
    /* A row from a database that predates M13 has no token, which reads as
       "never invited" rather than as an error. */
    invite: r.invite_token
      ? {
          token: r.invite_token as string,
          sentAt: (r.invite_sent_at as string) ?? undefined,
          activatedAt: (r.invite_activated_at as string) ?? undefined,
          claimedBy: (r.invite_claimed_by as string) ?? undefined,
        }
      : undefined,
    active: r.active === false ? false : undefined,
    guest: r.is_guest
      ? {
          company: (r.company as string) ?? undefined,
          selfDeclaredHandicap: r.handicap_self_declared === true,
          notes: (r.guest_notes as string) ?? undefined,
          sponsorListConsent: r.sponsor_list_consent === true,
          since: (r.updated_at as string) ?? new Date().toISOString(),
        }
      : undefined,
  };
}

/* ---- certifications ---- */

export function certToRow(tournamentId: string, round: number, c: Certification) {
  return {
    tournament_id: tournamentId,
    round,
    player_id: c.playerId,
    marker_id: c.markerId,
    stage: c.stage,
    marker_attested_at: c.markerAttestedAt ?? null,
    player_certified_at: c.playerCertifiedAt ?? null,
    marker_method: c.markerMethod ?? null,
    player_method: c.playerMethod ?? null,
    locked_hash: c.lockedHash ?? null,
    updated_at: new Date().toISOString(),
  };
}

export function rowToCert(r: Record<string, unknown>): Certification {
  return {
    playerId: r.player_id as string,
    markerId: r.marker_id as string,
    stage: r.stage as Certification["stage"],
    markerAttestedAt: (r.marker_attested_at as number) ?? undefined,
    playerCertifiedAt: (r.player_certified_at as number) ?? undefined,
    markerMethod: (r.marker_method as Certification["markerMethod"]) ?? undefined,
    playerMethod: (r.player_method as Certification["playerMethod"]) ?? undefined,
    lockedHash: (r.locked_hash as string) ?? undefined,
  };
}

/* ---- disputes ---- */

export function disputeToRow(tournamentId: string, d: Dispute) {
  return {
    id: d.id,
    tournament_id: tournamentId,
    round: d.round,
    player_id: d.playerId,
    hole_idx: d.holeIdx,
    marker_value: d.markerValue,
    player_value: d.playerValue,
    marker_entered_at: d.markerEnteredAt,
    player_entered_at: d.playerEnteredAt,
    reason: d.reason,
    raised_by: d.raisedBy,
    status: d.status,
    resolution: d.resolution ?? null,
    ts: d.ts,
    updated_at: new Date().toISOString(),
  };
}

export function rowToDispute(r: Record<string, unknown>): Dispute {
  return {
    id: r.id as string,
    playerId: r.player_id as string,
    round: (r.round as number) ?? 1,
    holeIdx: r.hole_idx as number,
    markerValue: (r.marker_value as number) ?? null,
    playerValue: (r.player_value as number) ?? null,
    markerEnteredAt: (r.marker_entered_at as number) ?? 0,
    playerEnteredAt: (r.player_entered_at as number) ?? 0,
    reason: (r.reason as string) ?? "",
    raisedBy: (r.raised_by as string) ?? "",
    status: r.status as Dispute["status"],
    resolution: (r.resolution as string) ?? undefined,
    ts: (r.ts as number) ?? 0,
  };
}

/* ---- corrections ---- */

export function correctionToRow(tournamentId: string, c: CorrectionRequest) {
  return {
    id: c.id,
    tournament_id: tournamentId,
    round: c.round,
    player_id: c.playerId,
    hole_idx: c.holeIdx,
    current_gross: c.currentGross,
    proposed_gross: c.proposedGross,
    reason: c.reason,
    status: c.status,
    decided_by: c.decidedBy ?? null,
    decision_reason: c.decisionReason ?? null,
    ts: c.ts,
    decided_at: c.decidedAt ?? null,
    updated_at: new Date().toISOString(),
  };
}

export function rowToCorrection(r: Record<string, unknown>): CorrectionRequest {
  return {
    id: r.id as string,
    playerId: r.player_id as string,
    round: (r.round as number) ?? 1,
    holeIdx: r.hole_idx as number,
    currentGross: (r.current_gross as number) ?? null,
    proposedGross: r.proposed_gross as number,
    reason: (r.reason as string) ?? "",
    status: r.status as CorrectionRequest["status"],
    decidedBy: (r.decided_by as string) ?? undefined,
    decisionReason: (r.decision_reason as string) ?? undefined,
    ts: (r.ts as number) ?? 0,
    decidedAt: (r.decided_at as number) ?? undefined,
  };
}

/* ---- audit log ---- */

export function auditToRow(a: AuditRecord) {
  return {
    id: a.id,
    tournament_id: a.tournamentId,
    round: a.round,
    player_id: a.playerId,
    kind: a.kind,
    actor: a.actor,
    ts: a.ts,
    hash: a.hash ?? null,
    device: a.device ?? null,
    gps: a.gps ?? null,
    distance_m: a.distanceFromClubhouseM ?? null,
    handicaps: a.handicaps ?? null,
    app_version: a.appVersion,
    detail: a.detail,
  };
}

export function rowToAudit(r: Record<string, unknown>): AuditRecord {
  return {
    id: r.id as string,
    tournamentId: r.tournament_id as string,
    round: (r.round as number) ?? 1,
    playerId: r.player_id as string,
    kind: r.kind as AuditRecord["kind"],
    actor: r.actor as string,
    ts: r.ts as number,
    hash: (r.hash as string) ?? undefined,
    device: (r.device as AuditRecord["device"]) ?? undefined,
    gps: (r.gps as AuditRecord["gps"]) ?? null,
    distanceFromClubhouseM: (r.distance_m as number) ?? null,
    handicaps: (r.handicaps as AuditRecord["handicaps"]) ?? undefined,
    appVersion: (r.app_version as string) ?? "",
    detail: (r.detail as string) ?? "",
  };
}

/* ---- club identity ---- */

export function clubToRow(c: ClubIdentity) {
  return {
    id: c.clubId,
    logo_url: c.logoUrl ?? null,
    accent: c.accent ?? null,
    phone: c.phone ?? null,
    phone_alt: c.phoneAlt ?? null,
    whatsapp: c.whatsapp ?? null,
    email: c.email ?? null,
    website: c.website ?? null,
    poster_credit: c.posterCredit ?? true,
    tv_background_url: c.tvBackgroundUrl ?? null,
    tv_messages: c.tvMessages ?? null,
    course_records: c.courseRecords ?? null,
    updated_at: new Date().toISOString(),
  };
}

export function rowToClub(r: Record<string, unknown>): ClubIdentity {
  return {
    clubId: r.id as string,
    logoUrl: (r.logo_url as string) ?? undefined,
    accent: (r.accent as string) ?? undefined,
    phone: (r.phone as string) ?? undefined,
    phoneAlt: (r.phone_alt as string) ?? undefined,
    whatsapp: (r.whatsapp as string) ?? undefined,
    email: (r.email as string) ?? undefined,
    website: (r.website as string) ?? undefined,
    posterCredit: r.poster_credit == null ? true : Boolean(r.poster_credit),
    tvBackgroundUrl: (r.tv_background_url as string) ?? undefined,
    tvMessages: (r.tv_messages as string[]) ?? undefined,
    courseRecords:
      (r.course_records as ClubIdentity["courseRecords"]) ?? undefined,
  };
}
