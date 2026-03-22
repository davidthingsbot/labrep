import { type StepModel, type StepEntity, type StepHeader, defaultHeader } from './step-model';

/**
 * Builder for constructing a StepModel for export.
 * Manages entity ID allocation.
 */
export interface StepModelBuilder {
  /** Allocate the next entity ID. */
  nextId(): number;
  /** Add an entity to the model. */
  addEntity(entity: StepEntity): void;
  /** Build the final StepModel. */
  build(header?: Partial<StepHeader>): StepModel;
}

/**
 * Create a new StepModelBuilder.
 *
 * @returns A builder that allocates sequential entity IDs starting from 1
 */
export function createStepModelBuilder(): StepModelBuilder {
  let nextEntityId = 1;
  const entities = new Map<number, StepEntity>();

  return {
    nextId(): number {
      return nextEntityId++;
    },

    addEntity(entity: StepEntity): void {
      entities.set(entity.id, entity);
    },

    build(header?: Partial<StepHeader>): StepModel {
      return {
        header: defaultHeader(header),
        entities: new Map(entities),
      };
    },
  };
}
