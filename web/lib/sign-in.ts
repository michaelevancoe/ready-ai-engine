export type ChurchRole = 'Parent' | 'Volunteer' | 'Leader';

export interface ChurchOption {
  readonly id: 'grace' | 'riverside';
  readonly name: string;
  readonly ministry: string;
  readonly role: ChurchRole;
  readonly person: string;
  readonly initial: string;
}

export const CHURCHES: readonly ChurchOption[] = [
  {
    id: 'grace',
    name: 'Grace Community Church',
    ministry: 'Kids Ministry',
    role: 'Parent',
    person: "Maya's parent",
    initial: 'M',
  },
  {
    id: 'riverside',
    name: 'Riverside Fellowship',
    ministry: 'Riverside Kids',
    role: 'Volunteer',
    person: 'Jordan Ellis',
    initial: 'J',
  },
];

export const INACTIVE_BODY =
  "Your sign-in link may have expired, or this email isn't on your church's invite list yet. That's okay. Your church can send a fresh invite.";

export type SignInView =
  | { readonly kind: 'email' }
  | { readonly kind: 'check'; readonly email: string }
  | { readonly kind: 'choose'; readonly email: string; readonly churchId: ChurchOption['id'] }
  | { readonly kind: 'inactive'; readonly email: string }
  | { readonly kind: 'app'; readonly email: string; readonly churchId: ChurchOption['id']; readonly menu: boolean }
  | { readonly kind: 'demo' };

export type SignInEvent =
  | { readonly type: 'send'; readonly email: string }
  | { readonly type: 'back' }
  | { readonly type: 'different' }
  | { readonly type: 'inactive' }
  | { readonly type: 'choose'; readonly churchId: string }
  | { readonly type: 'continue' }
  | { readonly type: 'menu' }
  | { readonly type: 'switch' }
  | { readonly type: 'signOut' }
  | { readonly type: 'demo' };

export function churchById(id: string): ChurchOption {
  const found = CHURCHES.find((church) => church.id === id);
  return found ?? CHURCHES[0]!;
}

export function headerTone(role: ChurchRole): 'parent' | 'volunteer' | 'leader' {
  switch (role) {
    case 'Parent':
      return 'parent';
    case 'Volunteer':
      return 'volunteer';
    case 'Leader':
      return 'leader';
    default: {
      const unexpected: never = role;
      return unexpected;
    }
  }
}

export function reduceSignIn(view: SignInView, event: SignInEvent): SignInView {
  switch (event.type) {
    case 'send': {
      const email = event.email.trim();
      if (email.length === 0) return { kind: 'email' };
      return { kind: 'check', email };
    }
    case 'back':
    case 'different':
    case 'signOut':
      return { kind: 'email' };
    case 'inactive': {
      const email = view.kind === 'check' || view.kind === 'inactive' ? view.email : '';
      return { kind: 'inactive', email };
    }
    case 'choose': {
      if (view.kind !== 'choose') return view;
      if (event.churchId !== 'grace' && event.churchId !== 'riverside') return view;
      return { ...view, churchId: event.churchId };
    }
    case 'continue':
      if (view.kind !== 'choose') return view;
      return { kind: 'app', email: view.email, churchId: view.churchId, menu: false };
    case 'menu':
      if (view.kind !== 'app') return view;
      return { ...view, menu: !view.menu };
    case 'switch':
      if (view.kind !== 'app') return view;
      return { kind: 'choose', email: view.email, churchId: view.churchId };
    case 'demo':
      return { kind: 'demo' };
    default: {
      const unexpected: never = event;
      return unexpected;
    }
  }
}
