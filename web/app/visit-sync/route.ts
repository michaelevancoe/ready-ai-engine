import { syncVisit } from '../../server/visit-sync';

export async function POST(request: Request): Promise<Response> {
  return syncVisit(request);
}
