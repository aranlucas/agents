import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const ADD_TO_CART_MESSAGE =
  "Add every matched item in this grocery list to my Kroger cart now.";

export function AddToCartDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Add this list to Kroger?</AlertDialogTitle>
          <AlertDialogDescription>
            This sends the matched items and quantities to your Kroger cart. Review them first —
            prices and availability can change before checkout.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onPress={() => onOpenChange(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onPress={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            Add to cart
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
