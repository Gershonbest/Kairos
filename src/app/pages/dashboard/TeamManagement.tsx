// Owner team seats: invite staff, change roles, and deactivate members.

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Plus, RotateCcw, UserMinus, Users } from "lucide-react";
import { api } from "../../../lib/api/client";
import { queryKeys } from "../../../lib/queryClient";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import {
  EmptyState,
  ErrorNote,
  ListRow,
  ListSkeleton,
  PageHeader,
  PageShell,
  SectionCard,
  StatCard,
  StatusBadge,
} from "../../components/dashboard-ui";

const ROLE_LABELS: Record<string, string> = {
  manager: "Manager",
  staff: "Staff",
  front_desk: "Front desk",
};

export function TeamManagement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [staffRole, setStaffRole] = useState<"manager" | "staff" | "front_desk">("staff");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { data: me } = useQuery({ queryKey: queryKeys.me, queryFn: () => api.me() });
  const { data: team, isPending, isError } = useQuery({
    queryKey: queryKeys.team,
    queryFn: () => api.getTeam(),
    enabled: Boolean(me?.is_owner),
  });

  const seats = team?.seats;
  const seatLabel = useMemo(() => {
    if (!seats) return "";
    if (seats.limit == null) return `${seats.used} seats used`;
    return `${seats.used} of ${seats.limit} seats`;
  }, [seats]);

  if (me && !me.is_owner) {
    return (
      <PageShell>
        <EmptyState
          icon={Users}
          title="Team is managed by the owner"
          description="Only the business owner can invite and manage team members."
        />
      </PageShell>
    );
  }

  async function sendInvite(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api.inviteTeamMember({
        email: email.trim(),
        full_name: fullName.trim(),
        staff_role: staffRole,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.team });
      setInviteOpen(false);
      setFullName("");
      setEmail("");
      setStaffRole("staff");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send invite.");
    } finally {
      setSaving(false);
    }
  }

  const standardLocked = seats?.limit === 1;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Settings"
        title="Team"
        description="Invite staff, assign roles, and decide who clients can book."
        actions={
          <Button onClick={() => setInviteOpen(true)} disabled={standardLocked || seats?.can_invite === false}>
            <Plus className="h-4 w-4" />
            Invite member
          </Button>
        }
      />
      {seatLabel && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <StatCard label="Seats" value={seatLabel} />
        </div>
      )}
      {(error || isError) && <ErrorNote>{error || "Unable to load your team."}</ErrorNote>}

      {standardLocked && (
        <EmptyState
          icon={Users}
          title="Upgrade to Premium to add staff"
          description="Standard includes the owner only. Premium adds up to 5 seats so more than one person can take appointments at the same hour."
          action={
            <Button onClick={() => navigate("/dashboard/choose-plan")}>Upgrade to Premium</Button>
          }
        />
      )}

      {isPending && <ListSkeleton rows={4} />}

      {!isPending && team && (
        <SectionCard title="Members">
          <div className="divide-y divide-border">
            {team.members.map((member) => (
              <ListRow key={member.id} className="items-start py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{member.full_name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {member.email}
                    {member.job_title ? ` · ${member.job_title}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                    {member.is_owner ? "Owner" : ROLE_LABELS[member.staff_role || "staff"]}
                  </span>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {!member.is_active
                      ? "Deactivated"
                      : member.is_bookable
                        ? "Bookable"
                        : "Active"}
                  </span>
                  {!member.is_owner && member.is_active && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await api.updateTeamMember(member.id, { is_active: false });
                        await queryClient.invalidateQueries({ queryKey: queryKeys.team });
                      }}
                    >
                      <UserMinus className="h-4 w-4" />
                      Deactivate
                    </Button>
                  )}
                  {!member.is_owner && (
                    <Select
                      value={member.staff_role || "staff"}
                      onValueChange={async (value) => {
                        await api.updateTeamMember(member.id, {
                          staff_role: value as "manager" | "staff" | "front_desk",
                        });
                        await queryClient.invalidateQueries({ queryKey: queryKeys.team });
                      }}
                    >
                      <SelectTrigger className="h-8 w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                        <SelectItem value="front_desk">Front desk</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {!member.is_owner && member.staff_role !== "staff" && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      Bookable
                      <Switch
                        checked={member.is_bookable}
                        onCheckedChange={async (checked) => {
                          await api.updateTeamMember(member.id, { is_bookable: checked });
                          await queryClient.invalidateQueries({ queryKey: queryKeys.team });
                        }}
                      />
                    </label>
                  )}
                </div>
              </ListRow>
            ))}
            {team.invites.map((invite) => (
              <ListRow key={invite.id} className="items-start py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{invite.full_name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {invite.email} · invited as {ROLE_LABELS[invite.staff_role]}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status="pending" />
                  <Button variant="ghost" size="sm" onClick={async () => api.resendTeamInvite(invite.id)}>
                    <RotateCcw className="h-4 w-4" />
                    Resend
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      await api.revokeTeamInvite(invite.id);
                      await queryClient.invalidateQueries({ queryKey: queryKeys.team });
                    }}
                  >
                    Revoke
                  </Button>
                </div>
              </ListRow>
            ))}
          </div>
        </SectionCard>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <form onSubmit={sendInvite}>
            <DialogHeader>
              <DialogTitle>Invite a team member</DialogTitle>
              <DialogDescription>
                They’ll get an email to set a password and join {seatLabel ? `(${seatLabel})` : "your team"}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <div>
                <Label htmlFor="team-name">Full name</Label>
                <Input
                  id="team-name"
                  className="mt-1"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="team-email">Email</Label>
                <Input
                  id="team-email"
                  type="email"
                  className="mt-1"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>Role</Label>
                <Select
                  value={staffRole}
                  onValueChange={(value) => setStaffRole(value as typeof staffRole)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff — own calendar, bookable</SelectItem>
                    <SelectItem value="front_desk">Front desk — book and reassign anyone</SelectItem>
                    <SelectItem value="manager">Manager — full operations, no billing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Sending…" : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
