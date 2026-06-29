import type { Diagnostic } from '../../diagnostics.ts';
import {
  createCoreDiagnostic,
  readPath,
  validateExactValue,
  validateRequiredStringArrayEntries
} from './contract-helpers.ts';
import { AUTH_SESSION_RUNTIME_FILE } from './auth-runtime-contracts.ts';

export const AUTH_PRODUCT_REVIEW_APPROVAL_FILE =
  'contracts/auth-product-review-approval.yaml';

export const AUTH_PRODUCT_REVIEW_APPROVAL_STATUS =
  'product_review_gate_declared_no_route_unblock';

export const AUTH_PRODUCT_REVIEW_APPROVAL_RECEIPT_BOUNDARY_STATUS =
  'typed_product_approval_gate_receipt_no_route_unblock';

const AUTH_RUNTIME_READINESS_FILE = 'contracts/auth-runtime-readiness.yaml';
const AUTH_PRODUCT_REVIEW_APPROVAL_REVIEW_STATUS = 'review_missing';
const AUTH_PRODUCT_REVIEW_APPROVAL_PROMOTION_BLOCKER =
  'no_product_reviewer_approval';

const REQUIRED_APPROVAL_SCOPES = [
  'auth_session_routes',
  'signup_login_recovery_routes',
  'passkey_routes',
  'oauth_callback_routes'
] as const;

const REQUIRED_APPROVAL_CONTROLS = [
  'product_reviewer_approval_required',
  'blocker_remains_until_approval_evidence',
  'approval_evidence_ref_required_before_unblock',
  'auth_session_runtime_contract_checked',
  'auth_runtime_readiness_contract_checked',
  'core_runtime_live_auth_integration_review_checked',
  'live_handler_disabled',
  'provider_exchange_disabled',
  'route_aliases_remain_blocked',
  'product_route_unblocked_false'
] as const;

const REQUIRED_FORBIDDEN_CLAIMS = [
  'product_route_unblocked',
  'production_route_ready',
  'promotion_ready',
  'live_auth_handler_ready',
  'provider_token_exchange_ready',
  'approval_without_evidence'
] as const;

const REQUIRED_VERIFICATION_EXPECTATIONS = [
  'this contract creates the product review evidence surface only',
  'this receipt is not live auth handler, provider token exchange, applied migration, or product route unblock proof'
] as const;

export function validateAuthProductReviewApprovalContract(
  value: unknown
): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: AUTH_PRODUCT_REVIEW_APPROVAL_FILE,
      path: 'contract.status',
      expected: AUTH_PRODUCT_REVIEW_APPROVAL_STATUS,
      message: `Core platform auth product review approval contract must stay \`${AUTH_PRODUCT_REVIEW_APPROVAL_STATUS}\`.`
    }),
    ...validateExactValue({
      value,
      file: AUTH_PRODUCT_REVIEW_APPROVAL_FILE,
      path: 'contract.owner_boundary',
      expected: 'identity',
      message:
        'Core platform auth product review approval contract must keep owner_boundary `identity`.'
    }),
    ...validateExactValue({
      value,
      file: AUTH_PRODUCT_REVIEW_APPROVAL_FILE,
      path: 'contract.runtime_status',
      expected: 'contracted_no_live_handler',
      message:
        'Core platform auth product review approval contract must keep runtime_status `contracted_no_live_handler`.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_PRODUCT_REVIEW_APPROVAL_FILE,
      path: 'contract.source_contracts',
      field: 'contract.source_contracts',
      requiredEntries: [AUTH_SESSION_RUNTIME_FILE, AUTH_RUNTIME_READINESS_FILE]
    }),
    ...validateApprovalGate(value),
    ...validateApprovalReceipt(value),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_PRODUCT_REVIEW_APPROVAL_FILE,
      path: 'required_controls',
      field: 'required_controls',
      requiredEntries: REQUIRED_APPROVAL_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_PRODUCT_REVIEW_APPROVAL_FILE,
      path: 'forbidden_claims',
      field: 'forbidden_claims',
      requiredEntries: REQUIRED_FORBIDDEN_CLAIMS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_PRODUCT_REVIEW_APPROVAL_FILE,
      path: 'verification_expectation',
      field: 'verification_expectation',
      requiredEntries: REQUIRED_VERIFICATION_EXPECTATIONS
    })
  ];
}

function validateApprovalGate(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: AUTH_PRODUCT_REVIEW_APPROVAL_FILE,
      path: 'approval_gate.gate_id',
      expected: 'product_reviewer_approval',
      message:
        'Core platform auth product review approval gate must keep gate_id `product_reviewer_approval`.'
    }),
    ...validateExactValue({
      value,
      file: AUTH_PRODUCT_REVIEW_APPROVAL_FILE,
      path: 'approval_gate.promotion_blocker',
      expected: AUTH_PRODUCT_REVIEW_APPROVAL_PROMOTION_BLOCKER,
      message: `Core platform auth product review approval gate must keep promotion_blocker \`${AUTH_PRODUCT_REVIEW_APPROVAL_PROMOTION_BLOCKER}\`.`
    }),
    ...validateExactValue({
      value,
      file: AUTH_PRODUCT_REVIEW_APPROVAL_FILE,
      path: 'approval_gate.approval_status',
      expected: AUTH_PRODUCT_REVIEW_APPROVAL_REVIEW_STATUS,
      message: `Core platform auth product review approval gate must keep approval_status \`${AUTH_PRODUCT_REVIEW_APPROVAL_REVIEW_STATUS}\` until product review evidence exists.`
    }),
    ...validateExactValue({
      value,
      file: AUTH_PRODUCT_REVIEW_APPROVAL_FILE,
      path: 'approval_gate.approval_evidence_ref_required',
      expected: true,
      message:
        'Core platform auth product review approval gate must require an approval evidence reference before unblock.'
    }),
    ...validateExactValue({
      value,
      file: AUTH_PRODUCT_REVIEW_APPROVAL_FILE,
      path: 'approval_gate.approved_by_required',
      expected: true,
      message:
        'Core platform auth product review approval gate must require reviewer identity before unblock.'
    }),
    ...validateExactValue({
      value,
      file: AUTH_PRODUCT_REVIEW_APPROVAL_FILE,
      path: 'approval_gate.approved_at_required',
      expected: true,
      message:
        'Core platform auth product review approval gate must require approval timestamp before unblock.'
    }),
    ...validateExactValue({
      value,
      file: AUTH_PRODUCT_REVIEW_APPROVAL_FILE,
      path: 'approval_gate.route_unblock_allowed',
      expected: false,
      message:
        'Core platform auth product review approval gate must keep route_unblock_allowed false before review evidence exists.'
    }),
    ...validateExactValue({
      value,
      file: AUTH_PRODUCT_REVIEW_APPROVAL_FILE,
      path: 'approval_gate.live_auth_handler_allowed',
      expected: false,
      message:
        'Core platform auth product review approval gate must keep live_auth_handler_allowed false before review evidence exists.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_PRODUCT_REVIEW_APPROVAL_FILE,
      path: 'approval_gate.approval_scope_required',
      field: 'approval_gate.approval_scope_required',
      requiredEntries: REQUIRED_APPROVAL_SCOPES
    })
  ];
}

function validateApprovalReceipt(value: unknown): readonly Diagnostic[] {
  const receiptPath = 'product_approval_review_receipt';

  return [
    ...validateReceiptExactValue({
      value,
      field: 'boundary_status',
      expected: AUTH_PRODUCT_REVIEW_APPROVAL_RECEIPT_BOUNDARY_STATUS,
      message: `Core platform auth product review approval receipt must keep boundary_status \`${AUTH_PRODUCT_REVIEW_APPROVAL_RECEIPT_BOUNDARY_STATUS}\`.`
    }),
    ...validateReceiptExactValue({
      value,
      field: 'auth_session_runtime_contract_checked',
      expected: true,
      message:
        'Core platform auth product review approval receipt must keep auth_session_runtime_contract_checked true.'
    }),
    ...validateReceiptExactValue({
      value,
      field: 'auth_runtime_readiness_contract_checked',
      expected: true,
      message:
        'Core platform auth product review approval receipt must keep auth_runtime_readiness_contract_checked true.'
    }),
    ...validateReceiptExactValue({
      value,
      field: 'core_runtime_live_auth_integration_review_checked',
      expected: true,
      message:
        'Core platform auth product review approval receipt must keep core_runtime_live_auth_integration_review_checked true.'
    }),
    ...validateReceiptExactValue({
      value,
      field: 'product_reviewer_approval_present',
      expected: false,
      message:
        'Core platform auth product review approval receipt must keep product_reviewer_approval_present false until approval evidence exists.'
    }),
    ...validateReceiptExactValue({
      value,
      field: 'product_approval_evidence_ref_present',
      expected: false,
      message:
        'Core platform auth product review approval receipt must keep product_approval_evidence_ref_present false until approval evidence exists.'
    }),
    ...validateReceiptExactValue({
      value,
      field: 'promotion_blocker',
      expected: AUTH_PRODUCT_REVIEW_APPROVAL_PROMOTION_BLOCKER,
      message: `Core platform auth product review approval receipt must keep promotion_blocker \`${AUTH_PRODUCT_REVIEW_APPROVAL_PROMOTION_BLOCKER}\`.`
    }),
    ...validateReceiptExactValue({
      value,
      field: 'promotion_ready',
      expected: false,
      message:
        'Core platform auth product review approval receipt must keep promotion_ready false.'
    }),
    ...validateReceiptExactValue({
      value,
      field: 'production_route_ready',
      expected: false,
      message:
        'Core platform auth product review approval receipt must keep production_route_ready false.'
    }),
    ...validateReceiptExactValue({
      value,
      field: 'live_auth_handler_enabled',
      expected: false,
      message:
        'Core platform auth product review approval receipt must keep live_auth_handler_enabled false.'
    }),
    ...validateReceiptExactValue({
      value,
      field: 'product_route_unblocked',
      expected: false,
      message:
        'Core platform auth product review approval receipt must keep product_route_unblocked false.'
    }),
    ...validateReceiptExactValue({
      value,
      field: 'provider_token_exchange_enabled',
      expected: false,
      message:
        'Core platform auth product review approval receipt must keep provider_token_exchange_enabled false.'
    }),
    ...validateReceiptExactValue({
      value,
      field: 'review_status',
      expected: AUTH_PRODUCT_REVIEW_APPROVAL_REVIEW_STATUS,
      message: `Core platform auth product review approval receipt must keep review_status \`${AUTH_PRODUCT_REVIEW_APPROVAL_REVIEW_STATUS}\`.`
    }),
    ...(readPath(value, receiptPath) === undefined
      ? [
          createCoreDiagnostic(
            AUTH_PRODUCT_REVIEW_APPROVAL_FILE,
            receiptPath,
            'Core platform auth product review approval contract must declare `product_approval_review_receipt`.'
          )
        ]
      : [])
  ];
}

function validateReceiptExactValue(input: {
  readonly value: unknown;
  readonly field: string;
  readonly expected: unknown;
  readonly message: string;
}): readonly Diagnostic[] {
  const path = `product_approval_review_receipt.${input.field}`;

  return validateExactValue({
    value: input.value,
    file: AUTH_PRODUCT_REVIEW_APPROVAL_FILE,
    path,
    expected: input.expected,
    message: input.message
  });
}
