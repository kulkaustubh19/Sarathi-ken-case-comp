import type { ScriptedCallPlan } from "./flow";

/** Replace this with a PSTN provider later without changing flow or speech code. */
export interface CallTransport {
  getStaffReply(): Promise<string>;
}

/** Wizard-of-Oz bridge: returns the predefined institution response for this scenario. */
export class ScriptedCallTransport implements CallTransport {
  constructor(private readonly plan: ScriptedCallPlan) {}

  async getStaffReply(): Promise<string> {
    const reply = this.plan.turns.find((turn) => turn.speaker === "staff");
    if (!reply) throw new Error("The scripted call has no staff reply.");
    return reply.text;
  }
}
