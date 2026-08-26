import seedVolunteers from '@/data/volunteers.json'

/**
 * Read access to the volunteer register.
 *
 * Async for the same reason as eventService: the call sites should not change
 * when this moves to Firestore.
 */
const withFullName = (volunteer) => ({
  ...volunteer,
  fullName: `${volunteer.firstName} ${volunteer.lastName}`
})

export async function listVolunteers() {
  return seedVolunteers.map(withFullName)
}

export async function getVolunteer(id) {
  const volunteer = seedVolunteers.find((v) => v.id === id)
  return volunteer ? withFullName(volunteer) : null
}

export async function listCoordinators() {
  return seedVolunteers
    .filter((v) => v.role === 'coordinator')
    .map(withFullName)
}

/** Distinct suburbs, for the filter controls on the events page. */
export async function listSuburbs() {
  return [...new Set(seedVolunteers.map((v) => v.suburb))].sort()
}
