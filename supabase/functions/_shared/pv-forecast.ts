export interface PvPhysicsInput {
  timestamp: string;
  latitude: number;
  longitude: number;
  tiltDeg: number;
  azimuthDeg: number;
  peakKwp: number;
  performanceRatio: number;
  ghi: number;
  dni?: number | null;
  dhi: number;
  ambientTemp: number;
}

export interface PvPhysicsResult {
  estimatedKwh: number;
  poaWm2: number;
  cellTempC: number;
  dniWm2: number;
}

const ALBEDO = 0.2;
const TEMP_COEFF = -0.004;
const NOCT = 45;

const deg2rad = (degrees: number) => (degrees * Math.PI) / 180;
const normalizeDegrees = (degrees: number) => ((degrees % 360) + 360) % 360;

const dayOfYear = (dateStr: string) => {
  const d = new Date(dateStr);
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
};

const isCEST = (dateStr: string): boolean => {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth();
  if (month < 2 || month > 9) return false;
  if (month > 2 && month < 9) return true;
  const lastDay = new Date(year, month + 1, 0).getDate();
  let lastSunday = lastDay;
  while (new Date(year, month, lastSunday).getDay() !== 0) lastSunday--;
  const switchDate = new Date(year, month, lastSunday, 2);
  return month === 2 ? d >= switchDate : d < switchDate;
};

const getClockHour = (timestamp: string) => {
  const parts = timestamp.match(/T(\d{2}):(\d{2})/);
  if (!parts) return 12;
  return parseInt(parts[1], 10) + parseInt(parts[2], 10) / 60;
};

const resolveDni = ({ ghi, dhi, dni, solarAltitudeRad }: { ghi: number; dhi: number; dni?: number | null; solarAltitudeRad: number }) => {
  if (dni != null) return dni;
  const directHorizontal = Math.max(0, ghi - dhi);
  const sinAltitude = Math.max(Math.sin(solarAltitudeRad), 0.05);
  return directHorizontal / sinAltitude;
};

const calculateSharedInputs = (timestamp: string, latitude: number, longitude: number) => {
  const latRad = deg2rad(latitude);
  const doy = dayOfYear(timestamp);
  const declination = deg2rad(23.45 * Math.sin(deg2rad((360 * (284 + doy)) / 365)));
  const clockHour = getClockHour(timestamp);
  const b = deg2rad((360 * (doy - 81)) / 365);
  const equationOfTime = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const refMeridian = isCEST(timestamp) ? 30 : 15;
  const longitudeCorrectionMinutes = 4 * (longitude - refMeridian);
  const solarHour = clockHour + (longitudeCorrectionMinutes + equationOfTime) / 60;
  const hourAngle = deg2rad((solarHour - 12) * 15);

  const sinAltitude = Math.sin(latRad) * Math.sin(declination)
    + Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngle);
  const solarAltitude = Math.asin(Math.max(-1, Math.min(1, sinAltitude)));
  const solarZenith = Math.PI / 2 - solarAltitude;

  return { latRad, declination, hourAngle, solarAltitude, solarZenith };
};

export const calculateLegacyPvOutput = (input: PvPhysicsInput): PvPhysicsResult => {
  const { latRad, declination, hourAngle, solarAltitude } = calculateSharedInputs(input.timestamp, input.latitude, input.longitude);
  const tiltRad = deg2rad(input.tiltDeg);

  let solarAzimuthSouthBased = 0;
  if (solarAltitude > 0.01) {
    const cosAz = (Math.sin(declination) - Math.sin(solarAltitude) * Math.sin(latRad))
      / (Math.cos(solarAltitude) * Math.cos(latRad));
    solarAzimuthSouthBased = Math.acos(Math.max(-1, Math.min(1, cosAz)));
    if (hourAngle < 0) solarAzimuthSouthBased = -solarAzimuthSouthBased;
  }

  const panelAzimuthSouthBased = deg2rad(input.azimuthDeg - 180);
  const cosAoi = Math.sin(solarAltitude) * Math.cos(tiltRad)
    + Math.cos(solarAltitude) * Math.sin(tiltRad) * Math.cos(solarAzimuthSouthBased - panelAzimuthSouthBased);

  const dniWm2 = resolveDni({
    ghi: input.ghi,
    dhi: input.dhi,
    dni: input.dni,
    solarAltitudeRad: solarAltitude,
  });

  const beam = dniWm2 * Math.max(0, cosAoi);
  const diffuse = input.dhi * (1 + Math.cos(tiltRad)) / 2;
  const ground = input.ghi * ALBEDO * (1 - Math.cos(tiltRad)) / 2;
  const poaWm2 = beam + diffuse + ground;
  const cellTemp = input.ambientTemp + ((NOCT - 20) / 800) * input.ghi;
  const tempFactor = 1 + TEMP_COEFF * (cellTemp - 25);
  const estimatedKwh = (poaWm2 * input.peakKwp * input.performanceRatio * Math.max(0.5, tempFactor)) / 1000;

  return {
    estimatedKwh: Math.round(estimatedKwh * 100) / 100,
    poaWm2: Math.round(poaWm2 * 100) / 100,
    cellTempC: Math.round(cellTemp * 10) / 10,
    dniWm2: Math.round(dniWm2 * 100) / 100,
  };
};

export const calculateCorrectedPvOutput = (input: PvPhysicsInput): PvPhysicsResult => {
  const { solarAltitude, solarZenith, hourAngle, latRad, declination } = calculateSharedInputs(input.timestamp, input.latitude, input.longitude);
  const tiltRad = deg2rad(input.tiltDeg);
  const panelAzimuthNorthBased = deg2rad(normalizeDegrees(input.azimuthDeg));

  const solarAzimuthNorthBased = normalizeDegrees(
    (Math.atan2(
      Math.sin(hourAngle),
      Math.cos(hourAngle) * Math.sin(latRad) - Math.tan(declination) * Math.cos(latRad),
    ) * 180) / Math.PI + 180,
  );
  const solarAzimuthRad = deg2rad(solarAzimuthNorthBased);

  const dniWm2 = resolveDni({
    ghi: input.ghi,
    dhi: input.dhi,
    dni: input.dni,
    solarAltitudeRad: solarAltitude,
  });

  const cosAoi = Math.cos(solarZenith) * Math.cos(tiltRad)
    + Math.sin(solarZenith) * Math.sin(tiltRad) * Math.cos(solarAzimuthRad - panelAzimuthNorthBased);

  const beam = dniWm2 * Math.max(0, cosAoi);
  const diffuse = input.dhi * (1 + Math.cos(tiltRad)) / 2;
  const ground = input.ghi * ALBEDO * (1 - Math.cos(tiltRad)) / 2;
  const poaWm2 = beam + diffuse + ground;
  const cellTemp = input.ambientTemp + ((NOCT - 20) / 800) * input.ghi;
  const tempFactor = 1 + TEMP_COEFF * (cellTemp - 25);
  const estimatedKwh = (poaWm2 * input.peakKwp * input.performanceRatio * Math.max(0.5, tempFactor)) / 1000;

  return {
    estimatedKwh: Math.round(estimatedKwh * 100) / 100,
    poaWm2: Math.round(poaWm2 * 100) / 100,
    cellTempC: Math.round(cellTemp * 10) / 10,
    dniWm2: Math.round(dniWm2 * 100) / 100,
  };
};
