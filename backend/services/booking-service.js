function availableSeats(maxParticipants, currentParticipants) {
  const max = Number(maxParticipants || 0);
  const current = Number(currentParticipants || 0);
  return Math.max(0, max - current);
}

function canBook(maxParticipants, currentParticipants, requestedSeats) {
  return availableSeats(maxParticipants, currentParticipants) >= Number(requestedSeats || 0);
}

module.exports = {
  availableSeats,
  canBook,
};
