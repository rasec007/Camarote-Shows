import { toast } from "sonner";
import { showSystemDialog } from "../../shared/ui/dialog";

export function confirmToast(message: string, onConfirm: () => void | Promise<void>) {
  showSystemDialog({
    title: "Confirmar operação",
    message,
    onConfirm,
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível concluir a operação."),
  });
}
