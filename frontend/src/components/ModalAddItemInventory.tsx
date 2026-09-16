import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, InputNumber, message, Switch, DatePicker, Select, Upload, Button, Avatar, Space } from 'antd';
import type { UploadProps } from 'antd';
import { UploadOutlined, DeleteOutlined, PictureOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useCreateItem, useUploadItemImage } from '../hooks/useInventory';
import { normalizarImagenCuadrada } from '../utils/normalizarImagenCuadrada';
import { reglasValorAtributo, reglaCantidadNoNegativa } from '../utils/validacionValorAtributo';
import type { NotificacionesConfig } from '../api/inventory.service';
import { CampanaOverrideNotificacion, limpiarNotificacionesOverrideItem } from './NotificacionItemOverride';
import dayjs from 'dayjs';

interface Props {
  open: boolean;
  onClose: () => void;
  inventoryId: number;
  atributosRequeridos: Record<string, string>;
  // Si el inventario tiene la foto habilitada (checkbox al crear/editar el
  // inventario) — igual que en ModalEditItemInventory, si no está prendida
  // ni se muestra el campo.
  fotosHabilitadas?: boolean;
  // Reglas de notificación del inventario — determina qué atributos (y si
  // la Cantidad) admiten un override puntual para este ítem. Lo que no se
  // fija acá cae al default del inventario.
  notificacionesConfig?: NotificacionesConfig;
}

export const ModalAddItemInventory: React.FC<Props> = ({
    open,
    onClose,
    inventoryId,
    atributosRequeridos = [],
    fotosHabilitadas = false,
    notificacionesConfig,
  }) => {
  const [form] = Form.useForm();
  const { mutate: createItem, isPending } = useCreateItem();
  const { mutate: subirImagen, isPending: subiendoImagen } = useUploadItemImage();

  // Todavía no existe el item (el endpoint de foto necesita un id), así que
  // la imagen elegida se guarda localmente nomás — se sube recién después
  // de que el item se cree, en handleSubmit. previewUrl es un blob: local
  // (URL.createObjectURL) solo para mostrar la miniatura antes de guardar;
  // se libera con revokeObjectURL al cerrar el modal o elegir otra foto.
  const [archivoImagen, setArchivoImagen] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const limpiarImagenSeleccionada = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setArchivoImagen(null);
    setPreviewUrl(null);
  };

  useEffect(() => {
    if (!open) limpiarImagenSeleccionada();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSeleccionarImagen: UploadProps['beforeUpload'] = async (file) => {
    const normalizada = await normalizarImagenCuadrada(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setArchivoImagen(normalizada);
    setPreviewUrl(URL.createObjectURL(normalizada));
    return false; // evita que antd intente subirla sola — todavía no hay item_id
  };

  const renderizarInput = (tipo: string) => {
    switch (tipo) {
      case 'integer':
      case 'natural':
        return <InputNumber style={{ width: '100%' }} />;
      case 'float':
        return <InputNumber step={0.1} style={{ width: '100%' }} />;
      case 'boolean':
        return <Switch checkedChildren={<CheckOutlined />} unCheckedChildren={<CloseOutlined />} />;
      case 'date':
        return <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />;
      case 'list':
        return (
          <Select>
            <Select.Option value="opcion1">Opción 1</Select.Option>
            <Select.Option value="opcion2">Opción 2</Select.Option>
          </Select>
        );
      case 'string':
      default:
        return <Input />;
    }
  };

  const handleSubmit = () => {
    form.validateFields().then((values) => {

      const atributosLimpios = { ...values.atributos };

      if (atributosLimpios) {
        Object.keys(atributosLimpios).forEach((key) => {
          if (dayjs.isDayjs(atributosLimpios[key])) {
            atributosLimpios[key] = atributosLimpios[key].format('YYYY-MM-DD'); 
          }
        });
      }

      const payloadCompleto = {
        ...values,
        atributos: atributosLimpios,
        notificaciones_config: limpiarNotificacionesOverrideItem(form.getFieldValue('notificaciones_config')),
        inventario_id: inventoryId
      };

      console.log("JSON listo con atributos dinámicos:", payloadCompleto);

      createItem(payloadCompleto, {
        onSuccess: (itemCreado) => {
          // El item ya existe (tiene id) recién acá — si el usuario eligió
          // una foto, se sube ahora, encadenada. Si esto falla, el item ya
          // quedó guardado igual: se avisa aparte, no se revierte la
          // creación (mismo criterio "camino B" que el resto de la app).
          if (archivoImagen) {
            subirImagen(
              { id: itemCreado.id, archivo: archivoImagen },
              {
                onSuccess: () => {
                  message.success('Artículo agregado con foto');
                  limpiarImagenSeleccionada();
                  form.resetFields();
                  onClose();
                },
                onError: (error) => {
                  console.error('Se creó el artículo pero falló la foto:', error);
                  message.warning('El artículo se guardó, pero la foto no se pudo subir. Podés cargarla editándolo.');
                  limpiarImagenSeleccionada();
                  form.resetFields();
                  onClose();
                },
              }
            );
            return;
          }

          message.success('Artículo agregado correctamente');
          form.resetFields();
          onClose();
        },
        onError: (error) => {
          console.error("Falló la petición:", error);
          message.error('No se pudo guardar el artículo en la base de datos');
        }
      });
    }).catch((error) => {
      console.log("Falló la validación del formulario", error);
    });
  };

  const listaAtributos = Object.entries(atributosRequeridos);

  return (
    <Modal
      title="Agregar Nuevo Artículo"
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={isPending || subiendoImagen}
      okText="Guardar"
      cancelText="Cancelar"
      destroyOnClose
    >
      {fotosHabilitadas && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <Avatar size={64} shape="square" icon={<PictureOutlined />} src={previewUrl ?? undefined} />
          <Space>
            <Upload showUploadList={false} beforeUpload={handleSeleccionarImagen} accept="image/jpeg,image/png,image/webp">
              <Button icon={<UploadOutlined />}>{previewUrl ? 'Cambiar foto' : 'Subir foto'}</Button>
            </Upload>
            {previewUrl && (
              <Button danger icon={<DeleteOutlined />} onClick={limpiarImagenSeleccionada}>
                Quitar
              </Button>
            )}
          </Space>
        </div>
      )}

      <Form form={form} layout="vertical">

        {/* --- CAMPOS ESTÁTICOS (Siempre están) --- */}
        <Form.Item name="nombre" label="Nombre del Artículo" rules={[{ required: true, message: 'Ingresá el nombre del artículo' }]}>
          <Input placeholder="Ej: Remera Básica" />
        </Form.Item>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 24 }}>
          <Form.Item name="cantidad" label="Cantidad" rules={[{ required: true, message: 'Ingresá la cantidad' }, reglaCantidadNoNegativa]} style={{ flex: 1, marginBottom: 0 }}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          {/* La campana de Cantidad siempre está disponible — no hace falta
              que el inventario tenga un mínimo/máximo default para poder
              pisarle un valor puntual a este ítem. */}
          <CampanaOverrideNotificacion
            tipo="numero"
            fieldNamePath={['notificaciones_config', 'cantidad']}
            defaultMinimo={notificacionesConfig?.cantidad?.minimo}
            defaultMaximo={notificacionesConfig?.cantidad?.maximo}
          />
        </div>

        {/* --- CAMPOS DINÁMICOS --- */}
        {listaAtributos.map(([nombreAtributo, tipoAtributo]) => {
          const notifAtributo = notificacionesConfig?.atributos?.[nombreAtributo];
          const esFecha = tipoAtributo === 'date';
          const esNumerico = ['integer', 'int', 'natural', 'float', 'number'].includes(tipoAtributo);
          return (
            <div key={nombreAtributo} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 24 }}>
              <Form.Item
                name={['atributos', nombreAtributo]}
                label={nombreAtributo}
                valuePropName={tipoAtributo === 'boolean' ? 'checked' : 'value'}
                initialValue={tipoAtributo === 'boolean' ? false : undefined}
                rules={reglasValorAtributo(tipoAtributo)}
                style={{ flex: 1, marginBottom: 0 }}
              >
                {renderizarInput(tipoAtributo)}
              </Form.Item>
              {(esFecha || esNumerico) && (
                <CampanaOverrideNotificacion
                  tipo={esFecha ? 'fecha' : 'numero'}
                  fieldNamePath={['notificaciones_config', 'atributos', nombreAtributo]}
                  defaultRecordatorioDias={notifAtributo?.tipo === 'fecha' ? notifAtributo.recordatorio_dias : undefined}
                  defaultMinimo={notifAtributo?.tipo === 'numero' ? notifAtributo.minimo : undefined}
                  defaultMaximo={notifAtributo?.tipo === 'numero' ? notifAtributo.maximo : undefined}
                />
              )}
            </div>
          );
        })}

      </Form>
    </Modal>
  );
};