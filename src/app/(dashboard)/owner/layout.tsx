// The /owner pages plus a slot for the customer pop-up (@modal). A row click
// anywhere under /owner soft-navigates to /owner/customers/<id>, and the
// intercepting route in @modal/(.)customers renders that page over the one
// you were on; a reload or a shared link lands on the full page instead.
export default function OwnerLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
