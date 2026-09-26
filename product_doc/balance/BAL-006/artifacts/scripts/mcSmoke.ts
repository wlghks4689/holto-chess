import { runMonteCarlo } from "./lib/fullEngineMC.ts";

const hands: [string[], string[], string[]] = [
  ["As", "Ah", "Kd", "Kc", "2s"],
  ["7c", "7d", "9h", "Jc", "4s"],
  ["Qs", "Qh", "Tc", "8d", "3h"],
];

const summary = runMonteCarlo(hands, "winner", 300, 1);
console.log(JSON.stringify(summary, null, 2));
