// Pure parts of depth.ts (unit-tested without DB/network).

/** No ack → one real Slack reminder + one Gmail notice (dispatch skill). Phone calls were dropped by the user. */
export function reminderAction(): string {
  const channel = process.env.PLANTAPI_SLACK_CHANNEL ?? "#plant-ops";
  const email = process.env.PLANTAPI_NOTICE_EMAIL;
  return [
    `Follow-up only (no new booking): (1) post ONE Slack message in ${channel} that @-mentions the plan's technician, reminding them of the CV-104 job and window and asking them to acknowledge;`,
    email ? `(2) send ONE Gmail notice to ${email} that the technician has not acknowledged yet.` : "(2) Gmail notice: PLANTAPI_NOTICE_EMAIL is not set — report it as blocked.",
    "Do NOT place any phone call and do NOT use Monid or Saperly. Report each message with the real id the system returned in `notices`.",
  ].join(" ");
}
