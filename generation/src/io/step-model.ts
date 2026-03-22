/**
 * A single value in a STEP entity's attribute list.
 */
export type StepValue =
  | { type: 'integer'; value: number }
  | { type: 'real'; value: number }
  | { type: 'string'; value: string }
  | { type: 'enum'; value: string }
  | { type: 'ref'; id: number }
  | { type: 'list'; values: StepValue[] }
  | { type: 'unset' }
  | { type: 'derived' }
  ;

/**
 * A single STEP entity (one line in the DATA section).
 */
export interface StepEntity {
  /** Entity ID (the #N). */
  readonly id: number;
  /** Entity type name (e.g., 'CARTESIAN_POINT'). */
  readonly typeName: string;
  /** Attribute values. */
  readonly attributes: readonly StepValue[];
}

/**
 * STEP file header metadata.
 */
export interface StepHeader {
  readonly description: string[];
  readonly implementationLevel: string;
  readonly fileName: string;
  readonly timeStamp: string;
  readonly author: string[];
  readonly organization: string[];
  readonly preprocessorVersion: string;
  readonly originatingSystem: string;
  readonly authorization: string;
  readonly schemaIdentifiers: string[];
}

/**
 * A parsed STEP file: header + entity map.
 */
export interface StepModel {
  readonly header: StepHeader;
  readonly entities: ReadonlyMap<number, StepEntity>;
}

/**
 * Create a default (empty) header with sensible defaults.
 */
export function defaultHeader(overrides?: Partial<StepHeader>): StepHeader {
  return {
    description: overrides?.description ?? [''],
    implementationLevel: overrides?.implementationLevel ?? '2;1',
    fileName: overrides?.fileName ?? 'labrep.stp',
    timeStamp: overrides?.timeStamp ?? new Date().toISOString(),
    author: overrides?.author ?? [''],
    organization: overrides?.organization ?? [''],
    preprocessorVersion: overrides?.preprocessorVersion ?? 'labrep',
    originatingSystem: overrides?.originatingSystem ?? 'labrep',
    authorization: overrides?.authorization ?? '',
    schemaIdentifiers: overrides?.schemaIdentifiers ?? ['AUTOMOTIVE_DESIGN'],
  };
}
