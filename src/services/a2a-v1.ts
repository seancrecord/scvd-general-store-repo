import { A2A_CURRENT_VERSION } from "@/lib/a2a-version";
import type { Env } from "@/types";
import { handleA2aRequest } from "@/services/a2a-evidence";
import type { EvidenceTaskRecord } from "@/services/a2a-tasks";

type ObjectValue = Record<string, unknown>;
type Answer = { status: number; body: ObjectValue };
const record = (value: unknown): value is ObjectValue => typeof value === "object" && value !== null && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(v => typeof v === "string");
const history = (value: unknown) => value === undefined || (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2147483647);
const keys = (value: ObjectValue, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
const optionalObject = (value: unknown) => value === undefined || record(value);
const optionalString = (value: unknown) => value === undefined || typeof value === "string";

function error(id: unknown, code: number, message: string, status = 200): Answer {
  return { status, body: { jsonrpc: "2.0", id, error: { code, message } } };
}

function taskV1(task: EvidenceTaskRecord) {
  // The immutable storage representation stays stable across both dialects.
  return {
    id: task.id, contextId: task.contextId,
    status: { ...task.status, state: task.status.state === "completed" ? "TASK_STATE_COMPLETED" : "TASK_STATE_FAILED" },
    artifacts: task.artifacts.map(artifact => ({ ...artifact, parts: artifact.parts.map(part => ({ data: part.data })) })),
    metadata: task.metadata,
  };
}

function answerV1(answer: Answer, send: boolean): Answer {
  if (record(answer.body["error"])) {
    const legacy = answer.body["error"];
    const data = legacy["data"];
    return { ...answer, body: { ...answer.body, error: { ...legacy, ...(data === undefined ? {} : {
      // v1 error.data is ProtoJSON Any[], not the 0.3 arbitrary object.
      data: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "INVALID_EVIDENCE_TASK", domain: "scvd.store", metadata: { details: JSON.stringify(data) } }],
    }) } } };
  }
  const task = taskV1(answer.body["result"] as unknown as EvidenceTaskRecord);
  return { ...answer, body: { ...answer.body, result: send ? { task } : task } };
}

/** Bounded v1 JSON-RPC binding, based on the pinned proto, not a general schema validator. */
export async function handleA2aV1Request(env: Env, body: unknown, now = new Date()): Promise<Answer> {
  const request = record(body) ? body : {};
  const id = typeof request["id"] === "string" || (typeof request["id"] === "number" && Number.isSafeInteger(request["id"])) ? request["id"] : null;
  if (request["jsonrpc"] !== "2.0" || typeof request["method"] !== "string" || id === null) return error(id, -32600, "Send a JSON-RPC 2.0 request with an id and method.", 400);
  const method = request["method"];
  const unsupported = ["SendStreamingMessage", "SubscribeToTask", "ListTasks"];
  if (unsupported.includes(method)) return error(id, -32004, "Streaming, subscription and task enumeration are not supported. Retrieve a known task with GetTask.");
  if (["CreateTaskPushNotificationConfig", "GetTaskPushNotificationConfig", "ListTaskPushNotificationConfigs", "DeleteTaskPushNotificationConfig"].includes(method)) return error(id, -32003, "Push notifications are not supported.");
  if (method === "GetExtendedAgentCard") return error(id, -32007, "Extended agent cards are not configured.");
  if (!["SendMessage", "GetTask", "CancelTask"].includes(method)) return error(id, -32601, "Method not found. This binding answers SendMessage, GetTask and CancelTask.");
  const params = request["params"];
  const invalid = () => error(id, -32602, `Invalid params. Use the v1 request shape documented at GET /a2a with A2A-Version: ${A2A_CURRENT_VERSION}.`);
  if (!record(params) || !optionalString(params["tenant"])) return invalid();
  if (params["tenant"]) return error(id, -32004, "Tenant routing is not supported.");
  const call = (legacyMethod: string, legacyParams: ObjectValue) => handleA2aRequest(env, { jsonrpc: "2.0", id, method: legacyMethod, params: legacyParams }, now);
  if (method !== "SendMessage") {
    if (!keys(params, method === "GetTask" ? ["id", "historyLength", "tenant"] : ["id", "tenant"]) || !nonempty(params["id"]) || !history(params["historyLength"])) return invalid();
    return answerV1(await call(method === "GetTask" ? "tasks/get" : "tasks/cancel", { id: params["id"], ...(params["historyLength"] === undefined ? {} : { historyLength: params["historyLength"] }) }), false);
  }
  if (!keys(params, ["message", "configuration", "metadata", "tenant"]) || !optionalObject(params["metadata"])) return invalid();
  const message = params["message"];
  if (!record(message) || !keys(message, ["messageId", "contextId", "taskId", "role", "parts", "metadata", "extensions", "referenceTaskIds"]) || !nonempty(message["messageId"]) || !["ROLE_USER", 1].includes(message["role"] as string | number) || !optionalString(message["contextId"]) || !optionalString(message["taskId"]) || !optionalObject(message["metadata"])) return invalid();
  for (const key of ["extensions", "referenceTaskIds"]) if (message[key] !== undefined && !strings(message[key])) return invalid();
  const parts = message["parts"];
  if (!Array.isArray(parts) || parts.length !== 1 || !record(parts[0])) return invalid();
  const part = parts[0];
  if (!keys(part, ["text", "data", "raw", "url", "metadata", "filename", "mediaType"]) || !optionalObject(part["metadata"]) || !optionalString(part["filename"]) || !optionalString(part["mediaType"])) return invalid();
  const contents = ["text", "data", "raw", "url"].filter(key => part[key] !== undefined);
  if (contents.length !== 1) return invalid();
  if (contents[0] !== "data" && contents[0] !== "text") return error(id, -32005, "Send one application/json data part, or a text part containing that JSON. File inputs are not supported.");
  if (contents[0] === "data" ? !record(part["data"]) : typeof part["text"] !== "string") return invalid();
  const configuration = params["configuration"];
  if (configuration !== undefined && (!record(configuration) || !keys(configuration, ["acceptedOutputModes", "taskPushNotificationConfig", "historyLength", "returnImmediately"]))) return invalid();
  const config = (configuration ?? {}) as ObjectValue;
  if (!history(config["historyLength"]) || (config["returnImmediately"] !== undefined && typeof config["returnImmediately"] !== "boolean") || (config["acceptedOutputModes"] !== undefined && !strings(config["acceptedOutputModes"]))) return invalid();
  if (config["taskPushNotificationConfig"] !== undefined) return error(id, -32003, "Push notifications are not supported.");
  if (config["returnImmediately"] === true) return error(id, -32004, "Asynchronous execution is not supported. Omit returnImmediately or set it to false.");
  if (message["taskId"]) {
    const prior = await call("tasks/get", { id: message["taskId"] });
    if (prior.body["error"]) return answerV1(prior, false);
    if (message["contextId"] && message["contextId"] !== (prior.body["result"] as EvidenceTaskRecord).contextId) return error(id, -32602, "contextId does not match the task.");
    return error(id, -32004, "Terminal tasks cannot be restarted. Send a new message without taskId.");
  }
  const legacyMessage = { ...message, ...(message["taskId"] === "" ? { taskId: undefined } : {}), kind: "message", role: "user", parts: [{ ...part, kind: contents[0] }] };
  return answerV1(await call("message/send", { message: legacyMessage, configuration: { ...(config["acceptedOutputModes"] === undefined ? {} : { acceptedOutputModes: config["acceptedOutputModes"] }), ...(config["historyLength"] === undefined ? {} : { historyLength: config["historyLength"] }) } }), true);
}
