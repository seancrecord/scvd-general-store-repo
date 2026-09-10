"""Tamper tests using the saved receipt and an outside Bitcoin header."""
import unittest
from pathlib import Path
from verify_ots_header import verify_header, verify_digest_header
from hashlib import sha256

ROOT = Path(__file__).resolve().parents[1]
OLD = ROOT / 'research/verification-2026-09-08'
NEW = ROOT / 'research/verification-2026-09-09'


class HeaderTests(unittest.TestCase):
    def setUp(self):
        self.payload = (OLD / 'receipt.payload.json').read_bytes()
        self.proof = (OLD / 'receipt.payload.json.ots').read_bytes()
        self.header = bytes.fromhex((NEW / 'receipt.header.hex').read_text().strip())
        self.block_hash = '00000000000000000001a27ca2feecc6065cf4e54bf4fe4f4ae0bd9dd16e9a42'

    def check(self, **changes):
        args = dict(payload=self.payload, proof=self.proof, header=self.header,
                    block_hash=self.block_hash, height=965852)
        args.update(changes)
        return verify_header(**args)

    def test_real_proof(self):
        result = self.check()
        self.assertTrue(result['proof_matches_header'])
        self.assertFalse(result['local_chain_validated'])

    def test_changed_payload(self):
        with self.assertRaises(ValueError):
            self.check(payload=self.payload + b' ')

    def test_changed_header(self):
        with self.assertRaises(ValueError):
            self.check(header=self.header[:40] + bytes([self.header[40] ^ 1]) + self.header[41:])

    def test_changed_proof(self):
        # Keep the detached-file envelope; alter a nonce in the operations.
        with self.assertRaises(Exception):
            self.check(proof=self.proof[:75] + bytes([self.proof[75] ^ 1]) + self.proof[76:])

    def test_wrong_height_or_hash(self):
        for changes in [dict(height=965851), dict(block_hash='00' * 32)]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.check(**changes)

    def test_digest_only_proof_keeps_preimage_limit(self):
        result = verify_digest_header(expected_digest=sha256(self.payload).digest(),
            proof=self.proof, header=self.header, block_hash=self.block_hash, height=965852)
        self.assertTrue(result['proof_matches_header'])
        self.assertFalse(result['payload_preimage_checked'])
        self.assertNotIn('payload_digest', result)
        self.assertEqual(result['committed_digest'], sha256(self.payload).hexdigest())

    def test_digest_only_refuses_a_different_hash_algorithm(self):
        import io
        from opentimestamps.core.timestamp import DetachedTimestampFile
        from opentimestamps.core.op import OpSHA1
        from opentimestamps.core.notary import PendingAttestation
        from opentimestamps.core.serialize import StreamSerializationContext
        stream = io.BytesIO()
        detached = DetachedTimestampFile.from_fd(OpSHA1(), io.BytesIO(self.payload))
        detached.timestamp.attestations.add(PendingAttestation('https://example.invalid'))
        detached.serialize(StreamSerializationContext(stream))
        with self.assertRaisesRegex(ValueError, 'requires SHA-256'):
            verify_digest_header(expected_digest=sha256(self.payload).digest(), proof=stream.getvalue(),
                header=self.header, block_hash=self.block_hash, height=965852)

    def test_digest_only_rejects_substitution_and_tampering(self):
        arguments = dict(expected_digest=sha256(self.payload).digest(), proof=self.proof,
            header=self.header, block_hash=self.block_hash, height=965852)
        for change in [dict(expected_digest=b'\x00'*32), dict(expected_digest=b'bad'), dict(expected_digest=None),
                       dict(proof=self.proof[:75]+bytes([self.proof[75]^1])+self.proof[76:]),
                       dict(header=b'\x00'*80), dict(height=965851)]:
            with self.subTest(change=tuple(change)), self.assertRaises(Exception):
                verify_digest_header(**{**arguments, **change})


if __name__ == '__main__':
    unittest.main()
