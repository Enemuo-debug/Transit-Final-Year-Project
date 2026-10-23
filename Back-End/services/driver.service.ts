import { randomUUID } from "node:crypto";
import { validateDriverCredentials, consumeSession } from "./session.service.js";
import { signToken, type DriverAuthUser } from "../middleware/auth.js";

export interface DriverLoginInput {
  session_code: string;
  plate_number: string;
  device_id?: string;
}

export interface DriverLoginResult {
  token: string;
  user: DriverAuthUser;
  session: {
    id: number;
    session_code: string;
    plate_number: string;
    is_active: boolean;
  };
}

/**
 * Exchange a dispatcher-issued code + plate for a driver JWT.
 *
 * The device id is generated once per browser/phone and stored locally. The
 * code can be used once; it is then pinned to that device for the audit trail.
 */
export async function driverLogin(input: DriverLoginInput): Promise<DriverLoginResult> {
  const deviceId = input.device_id?.trim() || randomUUID();
  const match = await validateDriverCredentials(input.session_code, input.plate_number);
  if (!match.ok) throw new Error(match.error);

  const { session, bus } = match;
  await consumeSession(session.id, deviceId);

  const user: DriverAuthUser = {
    role: "DRIVER",
    sessionId: session.id,
    companyId: session.company_id,
    plate_number: bus.plate_number,
    busId: bus.id,
    session_code: session.session_code,
    deviceId,
  };

  return {
    token: signToken(user),
    user,
    session: {
      id: session.id,
      session_code: session.session_code,
      plate_number: session.plate_number,
      is_active: session.is_active,
    },
  };
}
