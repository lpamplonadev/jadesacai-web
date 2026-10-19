"use client";

import Image from "next/image";
import { XIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { requestAdminApi } from "@/features/admin/infrastructure/admin-api";
import type {
  BottleExtraSetting,
  BottleProductSetting,
} from "@/shared/domain/store-settings";

type BottleExtraDraft = Omit<BottleExtraSetting, "priceCents"> & {
  price: string;
};

type BottleEditorDialogProps = {
  bottle?: BottleProductSetting;
  defaultExtras: BottleExtraSetting[];
  onClose: () => void;
  onSave: (bottle: BottleProductSetting) => Promise<void>;
};

const inputClassName =
  "min-h-11 w-full rounded-md border border-[#d6d6ce] bg-white px-3 text-sm outline-none focus:border-[#8b1a2e]";

function toPriceInput(priceCents: number) {
  return (priceCents / 100).toFixed(2);
}

function toPriceCents(value: string) {
  const amount = Number(value.trim().replace(",", "."));
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

async function readUploadError(response: Response) {
  const result = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return result?.error ?? "Não foi possível enviar a imagem.";
}

export function BottleEditorDialog({
  bottle,
  defaultExtras,
  onClose,
  onSave,
}: BottleEditorDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(bottle?.name ?? "");
  const [imageUrl, setImageUrl] = useState(bottle?.imageUrl ?? "");
  const [imageAlt, setImageAlt] = useState(bottle?.imageAlt ?? "");
  const [imagePreview, setImagePreview] = useState("");
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedImageName, setSelectedImageName] = useState("");
  const [price300, setPrice300] = useState(
    toPriceInput(bottle?.price300Cents ?? 0),
  );
  const [price500, setPrice500] = useState(
    toPriceInput(bottle?.price500Cents ?? 0),
  );
  const [available300, setAvailable300] = useState(
    bottle?.available300 ?? !bottle,
  );
  const [available500, setAvailable500] = useState(
    bottle?.available500 ?? !bottle,
  );
  const [extras, setExtras] = useState<BottleExtraDraft[]>(() =>
    (bottle?.extras?.length ? bottle.extras : defaultExtras).map((extra) => ({
      key: extra.key,
      name: extra.name,
      enabled: extra.enabled,
      price: toPriceInput(extra.priceCents),
    })),
  );
  const [enabled, setEnabled] = useState(bottle?.enabled ?? false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [imageError, setImageError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    if (!imagePreview) return;
    return () => URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  async function uploadImage(file: File) {
    setSelectedImageFile(file);
    setSelectedImageName(file.name);
    setImagePreview(URL.createObjectURL(file));
    setImageError("");
    setUploadingImage(true);

    const formData = new FormData();
    formData.set("file", file);
    try {
      const response = await requestAdminApi("/catalog/images", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json().catch(() => null)) as {
        imageUrl?: string;
        error?: string;
      } | null;
      if (!response.ok || !result?.imageUrl) {
        throw new Error(result?.error ?? "Não foi possível enviar a imagem.");
      }
      setImageUrl(result.imageUrl);
      setSelectedImageFile(null);
      setImagePreview("");
      if (!imageAlt.trim()) {
        setImageAlt(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
      }
      if (imageInputRef.current) imageInputRef.current.value = "";
    } catch (uploadError) {
      setImageError(
        uploadError instanceof Error
          ? uploadError.message
          : "Não foi possível enviar a imagem.",
      );
    } finally {
      setUploadingImage(false);
    }
  }

  function removeImage() {
    setImageUrl("");
    setImageAlt("");
    setSelectedImageFile(null);
    setSelectedImageName("");
    setImagePreview("");
    setImageError("");
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const price300Cents = toPriceCents(price300);
    const price500Cents = toPriceCents(price500);
    if (!available300 && !available500) {
      setError("Selecione pelo menos um tamanho disponível.");
      return;
    }
    if (
      (available300 && (!price300Cents || price300Cents <= 0)) ||
      (available500 && (!price500Cents || price500Cents <= 0))
    ) {
      setError("Informe um preço maior que zero para cada tamanho selecionado.");
      return;
    }
    if (uploadingImage || selectedImageFile) {
      setError("Conclua ou cancele o envio da imagem antes de salvar.");
      return;
    }
    const parsedExtras = extras.map((extra) => {
      const priceCents = toPriceCents(extra.price);
      return priceCents === null ? null : { ...extra, priceCents };
    });
    if (parsedExtras.some((extra) => extra === null)) {
      setError("Informe um preço válido para cada extra.");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        id: bottle?.id ?? `bottle-${crypto.randomUUID()}`,
        name: name.trim(),
        imageUrl: imageUrl.trim(),
        imageAlt: imageAlt.trim(),
        enabled,
        available300,
        available500,
        price300Cents: available300 ? (price300Cents ?? 0) : 0,
        price500Cents: available500 ? (price500Cents ?? 0) : 0,
        extras: parsedExtras as BottleExtraSetting[],
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar a garrafa.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="bottle-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[min(760px,calc(100%-2rem))] overflow-y-auto rounded-lg border border-[#deded7] bg-[#fffdfb] p-0 text-[#292923] shadow-2xl backdrop:bg-black/50"
    >
      <div className="flex items-center justify-between gap-4 border-b border-[#deded7] px-5 py-4 sm:px-7">
        <h2 id="bottle-editor-title" className="text-xl font-black">
          {bottle ? "Editar garrafa" : "Criar garrafa"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar formulário da garrafa"
          className="flex h-10 w-10 items-center justify-center rounded-md text-[#68685f] hover:bg-[#f3f3ef] hover:text-[#8b1a2e]"
        >
          <XIcon aria-hidden="true" size={19} />
        </button>
      </div>

      <form onSubmit={submit} className="space-y-5 px-5 py-6 sm:px-7">
        <label className="block space-y-1.5 text-sm font-bold">
          Nome da garrafa
          <input
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClassName}
          />
        </label>

        <fieldset className="space-y-3 border-y border-[#e8e8e2] py-4">
          <legend className="text-sm font-black">Imagem do produto</legend>
          <label className="block space-y-1.5 text-sm font-bold">
            URL da imagem
            <input
              type="url"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              className={inputClassName}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-bold">
            Enviar imagem do dispositivo
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploadingImage || saving}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void uploadImage(file);
              }}
              className={`${inputClassName} file:mr-3 file:rounded file:border-0 file:bg-[#f8eeee] file:px-3 file:py-2 file:text-xs file:font-bold file:text-[#8b1a2e]`}
            />
          </label>
          <p className="text-xs text-[#68685f]">JPEG, PNG ou WebP · até 5 MB.</p>
          {selectedImageName && (
            <p role="status" className="text-sm font-semibold text-[#8b1a2e]">
              {uploadingImage
                ? `Enviando ${selectedImageName}...`
                : selectedImageFile
                  ? `Selecionada: ${selectedImageName}`
                  : `Imagem enviada: ${selectedImageName}`}
            </p>
          )}
          {imageError && (
            <p role="alert" className="text-sm font-semibold text-red-800">
              {imageError}
            </p>
          )}
          {selectedImageFile && !uploadingImage && (
            <button
              type="button"
              onClick={() => void uploadImage(selectedImageFile)}
              className="min-h-9 text-sm font-bold text-[#8b1a2e] underline underline-offset-2"
            >
              Tentar upload novamente
            </button>
          )}
          {(imagePreview || imageUrl) && (
            <div className="relative h-40 w-full overflow-hidden rounded-md border border-[#deded7] bg-[#f3f3ef]">
              <Image
                src={imagePreview || imageUrl}
                alt={imageAlt || name || "Prévia da garrafa"}
                fill
                unoptimized
                sizes="(max-width: 640px) 100vw, 700px"
                className="object-contain"
              />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="min-w-56 flex-1 space-y-1.5 text-sm font-bold">
              Texto alternativo
              <input
                maxLength={180}
                value={imageAlt}
                onChange={(event) => setImageAlt(event.target.value)}
                className={inputClassName}
              />
            </label>
            {(imageUrl || imagePreview) && (
              <button
                type="button"
                onClick={removeImage}
                disabled={uploadingImage || saving}
                className="min-h-10 text-sm font-bold text-red-800 hover:underline disabled:opacity-50"
              >
                Remover imagem
              </button>
            )}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-black">Tamanhos e preços</legend>
          <p className="text-xs leading-5 text-[#77776e]">
            Marque os tamanhos disponíveis e defina o preço de cada opção.
          </p>
          <div className="divide-y divide-[#e8e8e2] border-y border-[#e8e8e2]">
            {([
              ["300 ml", available300, setAvailable300, price300, setPrice300],
              ["500 ml", available500, setAvailable500, price500, setPrice500],
            ] as const).map(([size, selected, setSelected, price, setPrice]) => (
              <div
                key={size}
                className="grid grid-cols-[minmax(0,1fr)_minmax(120px,180px)] items-center gap-3 py-3"
              >
                <label className="flex min-h-10 items-center gap-3 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(event) => setSelected(event.target.checked)}
                    className="h-4 w-4 accent-[#8b1a2e]"
                  />
                  {size}
                </label>
                <label className="block space-y-1 text-xs font-bold">
                  <span className="sr-only">Preço de {size} (R$)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    required={selected}
                    disabled={!selected}
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                    placeholder="Preço (R$)"
                    className={inputClassName}
                  />
                </label>
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-black">Extras opcionais</legend>
          <p className="text-xs leading-5 text-[#77776e]">
            Selecione os extras disponíveis para esta garrafa e defina o adicional.
          </p>
          <div className="divide-y divide-[#e8e8e2] border-y border-[#e8e8e2]">
            {extras.map((extra) => (
              <div
                key={extra.key}
                className="grid grid-cols-[minmax(0,1fr)_minmax(120px,180px)] items-center gap-3 py-3"
              >
                <label className="flex min-h-10 items-center gap-3 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={extra.enabled}
                    onChange={(event) =>
                      setExtras((current) =>
                        current.map((item) =>
                          item.key === extra.key
                            ? { ...item, enabled: event.target.checked }
                            : item,
                        ),
                      )
                    }
                    className="h-4 w-4 accent-[#8b1a2e]"
                  />
                  {extra.name}
                </label>
                <label className="block space-y-1 text-xs font-bold">
                  <span className="sr-only">Preço adicional de {extra.name} (R$)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={extra.price}
                    onChange={(event) =>
                      setExtras((current) =>
                        current.map((item) =>
                          item.key === extra.key
                            ? { ...item, price: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="Preço (R$)"
                    className={inputClassName}
                  />
                </label>
              </div>
            ))}
          </div>
        </fieldset>

        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={enabled}
            disabled={
              saving ||
              uploadingImage ||
              (available300 && !(toPriceCents(price300) ?? 0)) ||
              (available500 && !(toPriceCents(price500) ?? 0)) ||
              (!available300 && !available500)
            }
            onChange={(event) => setEnabled(event.target.checked)}
            className="h-4 w-4 accent-[#8b1a2e]"
          />
          Disponível na loja
        </label>

        {error && (
          <p role="alert" className="text-sm font-semibold text-red-800">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-3 border-t border-[#deded7] pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-11 rounded-md border border-[#d6d6ce] px-4 text-sm font-bold text-[#55554e] hover:bg-[#f3f3ef] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || uploadingImage}
            className="min-h-11 rounded-md bg-[#8b1a2e] px-5 text-sm font-extrabold text-white hover:bg-[#6b1222] disabled:cursor-wait disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar garrafa"}
          </button>
        </div>
      </form>
    </dialog>
  );
}