import { resetAccountVisit } from '../../server/visit-reset';

export async function POST(): Promise<Response> {
  return resetAccountVisit();
}
