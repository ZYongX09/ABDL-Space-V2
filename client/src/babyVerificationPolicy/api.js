import { BABY_VERIFICATION_POLICY_PATH, policyPayload, readPolicyResponse, sanitizePolicyError } from './model.js';

export function createBabyVerificationPolicyAPI(request) {
  const invoke = async (method, input, { signal } = {}) => {
    try {
      signal?.throwIfAborted();
      const value = await request(BABY_VERIFICATION_POLICY_PATH, { method, cache: 'no-store', signal,
        ...(method === 'PUT' ? { body: JSON.stringify(policyPayload(input)) } : {}) });
      signal?.throwIfAborted();
      return readPolicyResponse(value);
    } catch (error) { throw sanitizePolicyError(error, signal); }
  };
  return { babyVerificationPolicy: options => invoke('GET', undefined, options), saveBabyVerificationPolicy: (input, options) => invoke('PUT', input, options) };
}
