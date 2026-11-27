export function DraftStatus({ copy, id }: { copy: string; id?: string }) {
  return (
    <p id={id} className="draft-status story-pulse" role="status" aria-busy="true">
      {copy}
    </p>
  );
}
