import { resetAccountVisit } from '../../server/visit-reset';

export function POST(): Response {
  return resetAccountVisit();
}
