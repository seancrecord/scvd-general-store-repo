"""Offline OTS proof check against a caller-selected Bitcoin header.

Requires opentimestamps==0.4.5 and python-bitcoinlib==0.12.2 in an
isolated environment. Header-chain membership is the caller's trust input;
this does not implement Bitcoin consensus or fetch anything.
"""
import argparse
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from bitcoin.core import CBlockHeader, CheckProofOfWork, b2lx
from opentimestamps.core.serialize import StreamDeserializationContext
from opentimestamps.core.timestamp import DetachedTimestampFile
from opentimestamps.core.notary import BitcoinBlockHeaderAttestation


def verify_header(*, payload, proof, header, block_hash, height):
    if len(header) != 80 or height < 0:
        raise ValueError('Expected an 80-byte header and nonnegative height')
    block = CBlockHeader.deserialize(header)
    if b2lx(block.GetHash()) != block_hash:
        raise ValueError('Header hash differs from the caller-selected block')
    CheckProofOfWork(block.GetHash(), block.nBits)
    stream = io.BytesIO(proof)
    detached = DetachedTimestampFile.deserialize(StreamDeserializationContext(stream))
    if stream.read(1):
        raise ValueError('Trailing bytes after the detached timestamp')
    expected = DetachedTimestampFile.from_fd(detached.file_hash_op, io.BytesIO(payload))
    if expected.file_digest != detached.file_digest:
        raise ValueError('Payload digest differs from the proof')
    matched = False
    for message, attestation in detached.timestamp.all_attestations():
        if isinstance(attestation, BitcoinBlockHeaderAttestation) and attestation.height == height:
            attestation.verify_against_blockheader(message, block)
            matched = True
    if not matched:
        raise ValueError('No matching Bitcoin-height attestation')
    return {
        'payload_digest': detached.file_digest.hex(),
        'proof_matches_header': True,
        'header_proof_of_work_valid': True,
        'block_height': height,
        'block_hash': block_hash,
        'block_header_time': datetime.fromtimestamp(block.nTime, timezone.utc).isoformat(),
        'local_chain_validated': False,
        'trust_boundary': 'Caller establishes header-chain membership and height. A header alone does not prove either, nor factual truth or exact issue time.',
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['payload', 'proof', 'header', 'block-hash']:
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--height', required=True, type=int)
    args = parser.parse_args()
    result = verify_header(payload=Path(args.payload).read_bytes(),
                           proof=Path(args.proof).read_bytes(),
                           header=bytes.fromhex(Path(args.header).read_text().strip()),
                           block_hash=args.block_hash, height=args.height)
    print(json.dumps(result, indent=2))
