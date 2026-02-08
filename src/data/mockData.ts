export const energyConsumptionData = [
  { month: "Jan", strom: 4200, gas: 2800, waerme: 1800 },
  { month: "Feb", strom: 3900, gas: 3100, waerme: 2000 },
  { month: "Mär", strom: 4100, gas: 2600, waerme: 1600 },
  { month: "Apr", strom: 3800, gas: 2100, waerme: 1200 },
  { month: "Mai", strom: 4000, gas: 1800, waerme: 800 },
  { month: "Jun", strom: 4500, gas: 1500, waerme: 500 },
  { month: "Jul", strom: 4800, gas: 1200, waerme: 400 },
  { month: "Aug", strom: 4600, gas: 1300, waerme: 450 },
  { month: "Sep", strom: 4200, gas: 1700, waerme: 700 },
  { month: "Okt", strom: 3900, gas: 2200, waerme: 1100 },
  { month: "Nov", strom: 4100, gas: 2700, waerme: 1500 },
  { month: "Dez", strom: 4300, gas: 3000, waerme: 1900 },
];

export const costOverview = {
  currentMonth: 12450,
  previousMonth: 13200,
  savings: 750,
  savingsPercent: 5.7,
};

export const sustainabilityKPIs = {
  co2Current: 42.5,
  co2Target: 35.0,
  renewablePercent: 68,
  renewableTarget: 80,
  efficiencyScore: 82,
};

export const alerts = [
  {
    id: 1,
    type: "warning" as const,
    title: "Hoher Stromverbrauch",
    message: "Der Stromverbrauch liegt 15% über dem Durchschnitt der letzten 30 Tage.",
    time: "Vor 2 Stunden",
  },
  {
    id: 2,
    type: "info" as const,
    title: "Wartung geplant",
    message: "Geplante Wartung der Heizungsanlage am 15. Februar 2026.",
    time: "Vor 5 Stunden",
  },
  {
    id: 3,
    type: "success" as const,
    title: "Nachhaltigkeitsziel erreicht",
    message: "Das monatliche CO₂-Reduktionsziel wurde um 3% übertroffen.",
    time: "Gestern",
  },
  {
    id: 4,
    type: "warning" as const,
    title: "Gasverbrauch gestiegen",
    message: "Gasverbrauch hat sich im Vergleich zur Vorwoche um 8% erhöht.",
    time: "Vor 2 Tagen",
  },
];
