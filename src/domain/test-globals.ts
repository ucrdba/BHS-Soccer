/**
 * Install every src/domain/ namespace on the global object.
 *
 * The classic scripts under public/js/ reach extracted logic through `window`,
 * because they cannot import. Tests that evaluate those scripts through `?raw`
 * build a `window` by hand, so each one needs the namespaces too, or the
 * delegating prototype methods throw.
 *
 * Calling this beats repeating the same import-and-assign pair in every test,
 * and means a new domain module is wired into all of them at once. Tests that
 * import a domain module directly do not need it.
 */
import * as scheduleDomain from './schedule';
import * as matrixDomain from './matrix';
import * as matrixSessionDomain from './matrix-session';
import * as lineupDomain from './lineup';
import * as plusMinusCourt from './plus-minus-court';
import * as roundRobinDomain from './round-robin';
import * as seasonDomain from './season';
import * as progressDomain from './progress';
import * as reportDomain from './report';
import * as recordingNumbersDomain from './recording-numbers';
import * as rosterDomain from './roster';
import * as csvDomain from './csv';
import * as upsertDomain from './upsert';

export function installDomainGlobals(target: any = globalThis): void {
  Object.assign(target, {
    scheduleDomain, matrixDomain, matrixSessionDomain, lineupDomain,
    plusMinusCourt, roundRobinDomain, seasonDomain, progressDomain,
    reportDomain, recordingNumbersDomain, rosterDomain, csvDomain, upsertDomain
  });
}
