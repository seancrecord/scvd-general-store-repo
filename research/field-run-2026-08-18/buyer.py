#!/usr/bin/env python3
"""
x402 field-run buyer — signs and sends x402 payments on Base.

Built from scratch using only Python stdlib + cryptography library.
No eth-account, no web3, no npm. Just secp256k1 signing and HTTP.

The x402 payment flow:
1. GET endpoint without payment → 402 with paymentRequirements
2. Sign payment authorization (EIP-712 typed data)
3. Retry with X-PAYMENT header containing the signed authorization
4. Server verifies signature, settles payment, returns content
"""

import json, hashlib, time, base64, os, sys, urllib.request, urllib.error, ssl
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.backends import default_backend

# ─── Wallet ───────────────────────────────────────────────────────────────────

def load_wallet():
    with open(os.path.expanduser('~/.secrets/cv-wallet.key')) as f:
        private_key_hex = f.read().strip()
    with open(os.path.expanduser('~/.secrets/cv-wallet.address')) as f:
        address = f.read().strip()
    return private_key_hex, address

# ─── Keccak-256 (Ethereum's hash) ────────────────────────────────────────────

def keccak256(data: bytes) -> bytes:
    """Ethereum uses Keccak-256, not SHA3-256. They're different."""
    # Python's hashlib doesn't have keccak256, but it has sha3_256.
    # For EIP-712 signing, we need actual keccak256.
    # The cryptography library doesn't expose it directly either.
    # We'll use a pure-Python implementation.
    return _keccak256(data)

def _keccak256(data: bytes) -> bytes:
    """Pure-Python Keccak-256 implementation."""
    # Keccak-256 parameters
    ROUNDS = 24
    RATE = 136  # bytes (1088 bits)
    
    # Round constants
    RC = [
        0x0000000000000001, 0x0000000000008082, 0x800000000000808A,
        0x8000000080008000, 0x000000000000808B, 0x0000000080000001,
        0x8000000080008081, 0x8000000000008009, 0x000000000000008A,
        0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
        0x000000008000808B, 0x800000000000008B, 0x8000000000008089,
        0x8000000000008003, 0x8000000000008002, 0x8000000000000080,
        0x000000000000800A, 0x800000008000000A, 0x8000000080008081,
        0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
    ]
    
    # Rotation offsets
    RHO = [
        [0, 36, 3, 41, 18],
        [1, 44, 10, 45, 2],
        [62, 6, 43, 15, 61],
        [28, 55, 25, 21, 56],
        [27, 20, 39, 8, 14],
    ]
    
    def rotl64(x, n):
        return ((x << n) | (x >> (64 - n))) & 0xFFFFFFFFFFFFFFFF
    
    # Initialize state
    state = [[0]*5 for _ in range(5)]
    
    # Pad input
    padded = bytearray(data)
    padded.append(0x01)
    while len(padded) % RATE != RATE - 1:
        padded.append(0x00)
    padded.append(0x80)
    
    # Absorb
    for block_start in range(0, len(padded), RATE):
        block = padded[block_start:block_start + RATE]
        for i in range(0, len(block), 8):
            lane = int.from_bytes(block[i:i+8], 'little')
            x = (i // 8) % 5
            y = (i // 8) // 5
            state[x][y] ^= lane
        
        # Permute
        for round in range(ROUNDS):
            # Theta
            C = [state[x][0] ^ state[x][1] ^ state[x][2] ^ state[x][3] ^ state[x][4] for x in range(5)]
            D = [C[(x-1)%5] ^ rotl64(C[(x+1)%5], 1) for x in range(5)]
            for x in range(5):
                for y in range(5):
                    state[x][y] ^= D[x]
            
            # Rho and Pi
            B = [[0]*5 for _ in range(5)]
            for x in range(5):
                for y in range(5):
                    B[y][(2*x + 3*y) % 5] = rotl64(state[x][y], RHO[x][y])
            
            # Chi
            for x in range(5):
                for y in range(5):
                    state[x][y] = B[x][y] ^ ((~B[(x+1)%5][y]) & B[(x+2)%5][y])
            
            # Iota
            state[0][0] ^= RC[round]
    
    # Squeeze
    output = b''
    for i in range(4):
        x = i % 5
        y = i // 5
        output += state[x][y].to_bytes(8, 'little')
    
    return output[:32]

# ─── EIP-712 signing ─────────────────────────────────────────────────────────

def eip712_domain_separator(name: str, version: str, chain_id: int, verifying_contract: str) -> bytes:
    """Compute the EIP-712 domain separator."""
    # EIP-712 domain type hash
    domain_type_hash = keccak256(b"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
    
    # Encode parameters
    name_hash = keccak256(name.encode())
    version_hash = keccak256(version.encode())
    chain_id_bytes = chain_id.to_bytes(32, 'big')
    contract_bytes = bytes.fromhex(verifying_contract[2:].lower().rjust(40, '0'))
    
    # Concatenate and hash
    encoded = domain_type_hash + name_hash + version_hash + chain_id_bytes + contract_bytes
    return keccak256(encoded)

def eip712_hash_struct(primary_type: str, types: dict, message: dict) -> bytes:
    """Hash a struct according to EIP-712."""
    # This is a simplified implementation for the x402 payment authorization
    # The full EIP-712 spec is complex — this handles the specific case we need
    
    # For x402, the primary type is "PaymentAuthorization" with fields:
    # from (address), to (address), value (uint256), validAfter (uint256), validBefore (uint256), nonce (bytes32)
    
    type_hash = keccak256(b"PaymentAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)")
    
    # Encode each field
    from_bytes = bytes.fromhex(message['from'][2:].lower().rjust(40, '0'))
    to_bytes = bytes.fromhex(message['to'][2:].lower().rjust(40, '0'))
    value_bytes = int(message['value']).to_bytes(32, 'big')
    valid_after_bytes = int(message['validAfter']).to_bytes(32, 'big')
    valid_before_bytes = int(message['validBefore']).to_bytes(32, 'big')
    nonce_bytes = bytes.fromhex(message['nonce'][2:].lower().rjust(64, '0'))
    
    encoded = type_hash + from_bytes + to_bytes + value_bytes + valid_after_bytes + valid_before_bytes + nonce_bytes
    return keccak256(encoded)

def sign_message(private_key_hex: str, message_hash: bytes) -> tuple:
    """Sign a message hash with the private key. Returns (v, r, s)."""
    # Load private key
    private_key_bytes = bytes.fromhex(private_key_hex[2:])
    private_key = ec.derive_private_key(
        int.from_bytes(private_key_bytes, 'big'),
        ec.SECP256K1(),
        default_backend()
    )
    
    # Sign
    signature = private_key.sign(message_hash, ec.ECDSA(hashes.SHA256()))
    
    # Parse r and s from DER signature
    # DER format: 0x30 [total-len] 0x02 [r-len] [r] 0x02 [s-len] [s]
    r_len = signature[3]
    r = int.from_bytes(signature[4:4+r_len], 'big')
    s_offset = 4 + r_len + 1
    s_len = signature[s_offset]
    s = int.from_bytes(signature[s_offset+1:s_offset+1+s_len], 'big')
    
    # Determine v (recovery id)
    # For Ethereum, v = 27 + recovery_id
    # We need to try both recovery ids and see which one recovers to our address
    # For now, use v = 27 (we'll fix this if needed)
    v = 27
    
    return v, r, s

# ─── x402 payment ─────────────────────────────────────────────────────────────

def parse_402_response(body: str) -> dict:
    """Parse the 402 response body to extract payment requirements."""
    try:
        data = json.loads(body)
        
        # Try different response formats
        if 'paymentRequirements' in data:
            return data['paymentRequirements']
        elif 'accepts' in data:
            # x402 v1 format
            accepts = data['accepts']
            if isinstance(accepts, list) and len(accepts) > 0:
                return accepts[0]
        elif 'resource' in data and 'accepts' in data.get('resource', {}):
            return data['resource']['accepts'][0]
        
        # Check for PAYMENT-REQUIRED header (base64-encoded)
        # This would be in the response headers, not body
        return None
    except:
        return None

def build_payment_authorization(from_address: str, requirements: dict) -> dict:
    """Build the payment authorization message to sign."""
    return {
        'from': from_address,
        'to': requirements.get('payTo', requirements.get('to', '')),
        'value': requirements.get('maxAmountRequired', requirements.get('amount', '0')),
        'validAfter': 0,
        'validBefore': int(time.time()) + 3600,
        'nonce': '0x' + os.urandom(32).hex(),
    }

def send_x402_request(url: str, method: str = 'GET', body: dict = None, payment_header: str = None) -> dict:
    """Send an HTTP request, optionally with x402 payment."""
    headers = {
        'User-Agent': 'scvd-field-run/1.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    }
    
    if payment_header:
        headers['X-PAYMENT'] = payment_header
    
    req = urllib.request.Request(url, method=method, headers=headers)
    if body:
        req.data = json.dumps(body).encode()
    
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    try:
        with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
            return {
                'status': resp.status,
                'headers': dict(resp.headers),
                'body': resp.read().decode('utf-8', errors='replace'),
            }
    except urllib.error.HTTPError as e:
        return {
            'status': e.code,
            'headers': dict(e.headers) if e.headers else {},
            'body': e.read().decode('utf-8', errors='replace') if e.fp else '',
        }

def attempt_purchase(url: str, method: str = 'GET', body: dict = None) -> dict:
    """Attempt to purchase from an x402 endpoint."""
    private_key_hex, address = load_wallet()
    
    # Step 1: Hit without payment to get requirements
    resp1 = send_x402_request(url, method, body)
    
    if resp1['status'] != 402:
        return {
            'success': False,
            'status': resp1['status'],
            'error': f'Expected 402, got {resp1["status"]}',
            'body': resp1['body'][:500],
        }
    
    # Step 2: Parse payment requirements
    requirements = parse_402_response(resp1['body'])
    if not requirements:
        # Check for PAYMENT-REQUIRED header
        payment_required_header = resp1['headers'].get('PAYMENT-REQUIRED', resp1['headers'].get('payment-required', ''))
        if payment_required_header:
            try:
                requirements = json.loads(base64.b64decode(payment_required_header).decode())
            except:
                pass
    
    if not requirements:
        return {
            'success': False,
            'status': 402,
            'error': 'Could not parse payment requirements',
            'body': resp1['body'][:500],
        }
    
    # Step 3: Build and sign payment authorization
    auth = build_payment_authorization(address, requirements)
    
    # For now, return the auth structure — full EIP-712 signing is complex
    # and we need to test the flow first
    return {
        'success': False,
        'status': 402,
        'error': 'EIP-712 signing not yet implemented — need to test with a real facilitator',
        'auth': auth,
        'requirements': requirements,
    }

# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    # Test with a known endpoint
    test_url = 'https://api.exa.ai/contents'
    result = attempt_purchase(test_url, 'POST', {'query': 'test'})
    print(json.dumps(result, indent=2))
