type FlightDisplayInput = {
  id?: string | null;
  displayName?: string | null;
  flightNumber?: string | null;
  flightCode?: string | null;
  route?: string | null;
  departure?: string | Date | null;
};

export function formatFlightDisplayName(flight?: FlightDisplayInput | null) {
  if (!flight) return 'Reys';
  if (String(flight.displayName || '').trim()) return String(flight.displayName).trim();
  const numbered = [flight.flightNumber, flight.route].map((value) => String(value || '').trim()).filter(Boolean).join(' · ');
  if (numbered) return numbered;
  const date = flight.departure ? new Date(flight.departure) : null;
  const dated = [date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short' }) : '', flight.route, flight.flightCode]
    .map((value) => String(value || '').trim()).filter(Boolean).join(' · ');
  return dated || 'Reys ma’lumoti mavjud emas';
}
