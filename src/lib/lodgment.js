// Reservation Lodgment: same ID prefixes as Willow's Booking Details sheet (bookingform.txt generatePropertyPrefix).
const MAP = [['FAHRENHEIT', 'FH'], ['NOVO', 'NOV'], ['FLEXUS', 'FX'], ['ARIA', 'AR'], ['LUXE', 'TL'], ['ROBERTSON', 'RB'], ['GARDEN', 'SG'],
  ['CENTRESTAGE', 'CS'], ['WINDMILL', 'WM'], ['THREE28', 'TR'], ['ONE', 'OR'], ['MIDTOWN', 'PJMT'], ['LIBERTY', 'LA'], ['FRASER', 'FR'],
  ['LUCENTIA', 'LC'], ['SUCASA,', 'SC'], ['ANGGUN', 'ANG'], ['SKY', 'SS'], ['SEPUTEH', 'AS'], ['IDAMAN', 'IR'], ['LAVILE', 'LM'],
  ['SECOYA', 'SR'], ['ROYCE', 'RR'], ['TROPICANA', 'TC'], ['BUNGALOW', 'B'], ['AMPANG', '183AMP'], ["D'MAJESTIC", 'DM']];

export function idPrefix(propertyName) {
  const p = String(propertyName || '').toUpperCase().trim();
  const hit = MAP.find(([k]) => p.includes(k));
  if (hit) return hit[1];
  const out = p.split(' ').filter(w => w && isNaN(w)).map(w => w[0]).join('');
  return out.substring(0, 3) || 'BK';
}
