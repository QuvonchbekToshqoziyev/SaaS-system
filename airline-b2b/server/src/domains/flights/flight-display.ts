type FlightDisplayInput = {
  id?: string | null;
  displayName?: string | null;
  flightNumber?: string | null;
  flightCode?: string | null;
  route?: string | null;
  departure?: string | Date | null;
};

export function flightDisplayName(flight?: FlightDisplayInput | null) {
  if (!flight) return 'Reys';
  const explicit = String(flight.displayName || '').trim();
  if (explicit) return explicit;
  const numbered = [flight.flightNumber, flight.route].map((value) => String(value || '').trim()).filter(Boolean).join(' · ');
  if (numbered) return numbered;
  const date = flight.departure ? new Date(flight.departure) : null;
  const dated = [date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : '', flight.route, flight.flightCode]
    .map((value) => String(value || '').trim()).filter(Boolean).join(' · ');
  return dated || 'Reys ma’lumoti mavjud emas';
}
