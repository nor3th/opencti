import * as R from 'ramda';
import { Promise } from 'bluebird';
import { READ_DATA_INDICES } from '../database/utils';
import { ENTITY_TYPE_INDICATOR } from '../schema/stixDomainObject';
import { BULK_TIMEOUT, elBulk, elList, ES_MAX_CONCURRENCY, MAX_SPLIT } from '../database/engine';
import { logApp } from '../config/conf';
import { ABSTRACT_STIX_CORE_OBJECT, ABSTRACT_STIX_CORE_RELATIONSHIP, buildRefRelationKey } from '../schema/general';
import { SYSTEM_USER } from '../utils/access';
import { RELATION_INDICATES } from '../schema/stixCoreRelationship';

export const up = async (next) => {
  const start = new Date().getTime();
  logApp.info('[MIGRATION] Cleaning indicates for all entities and relationships');
  const bulkOperations = [];
  const callback = (entities) => {
    const op = entities
      .filter((n) => n.entity_type !== ENTITY_TYPE_INDICATOR)
      .map((att) => {
        return [
          { update: { _index: att._index, _id: att.id } },
          { doc: { [buildRefRelationKey(RELATION_INDICATES)]: null } },
        ];
      })
      .flat();
    bulkOperations.push(...op);
  };
  const filters = [{ key: buildRefRelationKey(RELATION_INDICATES), values: ['EXISTS'] }];
  const opts = { types: [ABSTRACT_STIX_CORE_OBJECT, ABSTRACT_STIX_CORE_RELATIONSHIP], filters, callback };
  await elList(SYSTEM_USER, READ_DATA_INDICES, opts);
  // Apply operations.
  let currentProcessing = 0;
  const groupsOfOperations = R.splitEvery(MAX_SPLIT, bulkOperations);
  const concurrentUpdate = async (bulk) => {
    await elBulk({ refresh: true, timeout: BULK_TIMEOUT, body: bulk });
    currentProcessing += bulk.length;
    logApp.info(`[OPENCTI] Cleaning indicates indexation: ${currentProcessing} / ${bulkOperations.length}`);
  };
  await Promise.map(groupsOfOperations, concurrentUpdate, { concurrency: ES_MAX_CONCURRENCY });
  logApp.info(`[MIGRATION] Cleaning indicates done in ${new Date() - start} ms`);
  next();
};

export const down = async (next) => {
  next();
};
