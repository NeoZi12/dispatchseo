import { Modal } from "../../../modal";
import { CustomerGhost } from "../../../skeleton";

// The pop-up opens at once with the page's ghost inside, then fills.
export default function Loading() {
  return (
    <Modal label="Loading the customer">
      <CustomerGhost inModal />
    </Modal>
  );
}
