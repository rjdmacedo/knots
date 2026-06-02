export function findMatchingParticipant(
  userName: string,
  participants: Array<{ id: string; name: string }>,
): { id: string; name: string } | null {
  let participant = participants.find((p) => p.name === userName)
  if (participant) return participant

  participant = participants.find(
    (p) => p.name.toLowerCase() === userName.toLowerCase(),
  )
  if (participant) return participant

  const normalizedUserName = userName.toLowerCase().trim()
  participant = participants.find(
    (p) =>
      p.name.toLowerCase().trim() === normalizedUserName ||
      p.name.toLowerCase().includes(normalizedUserName) ||
      normalizedUserName.includes(p.name.toLowerCase()),
  )

  return participant || null
}
