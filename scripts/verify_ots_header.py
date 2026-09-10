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
from opentimestamps.core.op import OpSHA256


def _verify_header(*, payload=None, expected_digest=None, proof, header, block_hash, height):
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
    if expected_digest is None:
        expected_digest = DetachedTimestampFile.from_fd(detached.file_hash_op, io.BytesIO(payload)).file_digest
    elif len(expected_digest) != 32 or not isinstance(detached.file_hash_op, OpSHA256):
        raise ValueError('A digest-only binding requires SHA-256')
    if expected_digest != detached.file_digest:
        raise ValueError('Expected digest differs from the proof')
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


def verify_header(*, payload, proof, header, block_hash, height):
    return _verify_header(payload=payload, proof=proof, header=header,
                          block_hash=block_hash, height=height)


def verify_digest_header(*, expected_digest, proof, header, block_hash, height):
    if not isinstance(expected_digest, bytes) or len(expected_digest) != 32:
        raise ValueError('Expected a 32-byte SHA-256 digest')
    result = _verify_header(expected_digest=expected_digest, proof=proof,
                            header=header, block_hash=block_hash, height=height)
    result['committed_digest'] = result.pop('payload_digest')
    result['payload_preimage_checked'] = False
    result['trust_boundary'] += ' Caller establishes the SHA-256 binding; buyer-held preimage bytes were not supplied or checked.'
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--payload')
    source.add_argument('--digest', help='Independently established SHA-256 hex digest; does not verify preimage bytes')
    for name in ['proof', 'header', 'block-hash']:
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--height', required=True, type=int)
    args = parser.parse_args()
    common = dict(proof=Path(args.proof).read_bytes(),
                  header=bytes.fromhex(Path(args.header).read_text().strip()),
                  block_hash=args.block_hash, height=args.height)
    result = (verify_header(payload=Path(args.payload).read_bytes(), **common) if args.payload
              else verify_digest_header(expected_digest=bytes.fromhex(args.digest), **common))
    print(json.dumps(result, indent=2))
