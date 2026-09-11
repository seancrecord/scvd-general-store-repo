"""SCVD x402 Verifier — a Gradio Space that is also an MCP server.

Five read-only tools, each one call to scvd.store's verifier door
(``/mcp/verifier``), each answer the store's own. ``mcp_server=True``
publishes the same five functions at this Space's ``/gradio_api/mcp/``
endpoint, which is what hf-discover reads when a Space is tagged
``mcp-server``. Nothing here sells anything; the paid instruments live
on the store's other doors and are not reachable from this Space.
"""

import gradio as gr

from verifier import (
    get_defect_definition,
    lookup_endpoint_readiness,
    preflight_x402_endpoint,
    verify_scvd_artifact,
    verify_x402_receipt,
)

POSITION = (
    "scvd.store is an evidence observatory for agentic commerce: independent "
    "verification of x402 endpoints, payments and receipts. This Space fronts "
    "the store's read-only verifier door and sells nothing. Every answer is the "
    "store's, unmodified; every answer names what it could not see."
)

OUTPUT = lambda: gr.Code(label="The door's answer", language="json")  # noqa: E731

preflight = gr.Interface(
    fn=preflight_x402_endpoint,
    inputs=gr.Textbox(label="Endpoint URL", placeholder="https://door.example/api/paid-answer"),
    outputs=OUTPUT(),
    title="Preflight an x402 endpoint",
    description="One unpaid probe: does this URL serve a 402 challenge a stock client could sign?",
    api_name="preflight_x402_endpoint",
    flagging_mode="never",
)

receipt = gr.Interface(
    fn=verify_x402_receipt,
    inputs=[
        gr.Textbox(label="Signed offer or receipt (compact JWS)", lines=4),
        gr.Textbox(label="Kind (optional)", placeholder="detected when empty"),
        gr.Textbox(label="Issuer public key, hex (optional, for an offline check)"),
    ],
    outputs=OUTPUT(),
    title="Verify an x402 receipt or signed offer",
    description="Any issuer's. Structure, signature, liveness.",
    api_name="verify_x402_receipt",
    flagging_mode="never",
)

readiness = gr.Interface(
    fn=lookup_endpoint_readiness,
    inputs=gr.Textbox(label="Host", placeholder="door.example"),
    outputs=OUTPUT(),
    title="Look up an endpoint's readiness history",
    description="What the signed weekly corpus holds about one host, gaps included. Never a ranking.",
    api_name="lookup_endpoint_readiness",
    flagging_mode="never",
)

defect = gr.Interface(
    fn=get_defect_definition,
    inputs=gr.Textbox(label="Defect class id (empty lists all)", placeholder="status-402"),
    outputs=OUTPUT(),
    title="Get an x402 defect definition",
    description="One named class from the store's registered vocabulary.",
    api_name="get_defect_definition",
    flagging_mode="never",
)

artifact = gr.Interface(
    fn=verify_scvd_artifact,
    inputs=gr.Textbox(label="Artifact id", placeholder="cert_…, stamp_… or anchor_…"),
    outputs=OUTPUT(),
    title="Verify an artifact this store signed",
    description="The exact signed bytes and the ed25519 key, so the check repeats offline.",
    api_name="verify_scvd_artifact",
    flagging_mode="never",
)

demo = gr.TabbedInterface(
    [preflight, receipt, readiness, defect, artifact],
    ["Preflight", "Receipt", "Readiness", "Defect", "Artifact"],
    title="SCVD x402 Verifier",
)

if __name__ == "__main__":
    demo.launch(mcp_server=True)
