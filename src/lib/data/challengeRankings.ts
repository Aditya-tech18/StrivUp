interface Member {
  user_id: string;
}

interface ApprovedProof {
  user_id: string;
  day_number: number;
}

export function rankChallengeDays(
  members: Member[],
  approvedProofs: ApprovedProof[],
  durationDays: number | null,
) {
  const daysByMember = new Map(members.map(({ user_id }) => [user_id, new Set<number>()]));
  for (const { user_id, day_number } of approvedProofs) {
    if (!Number.isInteger(day_number) || day_number < 1 || (durationDays && day_number > durationDays)) continue;
    daysByMember.get(user_id)?.add(day_number);
  }

  const ranked = Array.from(daysByMember, ([userId, days]) => ({ userId, daysCompleted: days.size }))
    .filter(({ daysCompleted }) => daysCompleted > 0)
    .sort((a, b) => b.daysCompleted - a.daysCompleted || a.userId.localeCompare(b.userId));

  let rank = 0;
  return ranked.map((entry, index) => {
    if (entry.daysCompleted !== ranked[index - 1]?.daysCompleted) rank = index + 1;
    return { ...entry, rank };
  });
}
