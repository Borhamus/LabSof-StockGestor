import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, InputNumber, Switch, DatePicker, Upload, Button, Avatar, Space, message } from 'antd';
import type { UploadProps } from 'antd';
import { UploadOutlined, DeleteOutlined, PictureOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useUpdateItem, useUploadItemImage, useDeleteItemImage } from '../hooks/useInventory';
import { normalizarImagenCuadrada } from '../utils/normalizarImagenCuadrada';
import { urlImagen } from '../api/axios.config';
import { reglasValorAtributo, reglaCantidadNoNegativa } from '../utils/validacionValorAtributo';
import type { NotificacionesConfig } from '../api/inventory.service';
import { CampanaOverrideNotificacion, limpiarNotificacionesOverrideItem } from './NotificacionItemOverride';

interface Props {
  open: boolean;
  onClose: () => void;
  item: any;
  atributosRequeridos: Record<string,string>
  // Si el inventario al que pertenece este item tiene la foto habilitada
  // (checkbox al crear/editar el inventario) — si no, ni se muestra el
  // campo, no tiene sentido ofrecerlo si nunca lo van a usar.
  fotosHabilitadas?: boolean
  // Reglas de notificación del inventario — determina qué atributos (y si
  // la Cantidad) admiten un override puntual para este ítem.
  notificacionesConfig?: NotificacionesConfig
}
export const ModalEditItemInventory: React.FC<Props> = ({
    open,
    onClose,
    item,
    atributosRequeridos,
    fotosHabilitadas = false,
    notificacionesConfig,
  }) => {

    const [form] = Form.useForm();
    const { mutate: updateItem, isPending } = useUpdateItem();
    const { mutate: subirImagen, isPending: subiendoImagen } = useUploadItemImage();
    const { mutate: borrarImagen, isPending: borrandoImagen } = useDeleteItemImage();

    // `item` es una foto congelada del momento en que se abrió el modal —
    // el padre no la actualiza sola cuando invalidamos la query al subir o
    // borrar la imagen. Sin este estado propio, el modal seguía mostrando
    // la foto vieja (o la seguía "teniendo" para el botón Quitar) aunque el
    // backend y la tabla de atrás ya estuvieran al día.
    const [imagenActual, setImagenActual] = useState<string | null | undefined>(item?.imagen);

    useEffect(() => {
      if (open) setImagenActual(item?.imagen);
    }, [open, item]);

    const handleSubirImagen: UploadProps['customRequest'] = async (options) => {
      const archivo = await normalizarImagenCuadrada(options.file as File);
      subirImagen(
        { id: item.id, archivo },
        {
          onSuccess: (itemActualizado) => {
            setImagenActual(itemActualizado.imagen);
            options.onSuccess?.({});
          },
          onError: (error) => options.onError?.(error as Error),
        }
      );
    };

    const handleQuitarImagen = () => {
      borrarImagen(item.id, {
        onSuccess: (itemActualizado) => setImagenActual(itemActualizado.imagen),
      });
    };

    useEffect(() => {
        if (open && item) {

          const atributosFormateados = {...item.atributos}

          Object.entries(atributosRequeridos).forEach(([nombreAtributo, tipoAtributo]) => {
            if (tipoAtributo === 'date' && atributosFormateados[nombreAtributo]) {
              const fecha = dayjs(atributosFormateados[nombreAtributo]);
              atributosFormateados[nombreAtributo] = fecha.isValid() ? fecha : undefined;
            }
          });

          form.setFieldsValue({
            nombre: item.nombre,
            cantidad: item.cantidad,
            atributos: atributosFormateados,
            notificaciones_config: item.notificaciones_config || {},
          });
        }
      }, [open, item, form]);

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
          nombre: values.nombre,
          cantidad: values.cantidad,
          atributos: atributosLimpios,
          notificaciones_config: limpiarNotificacionesOverrideItem(form.getFieldValue('notificaciones_config')),
        };
  
        updateItem(
          { id: item.id, payload: payloadCompleto }, 
          {
            onSuccess: () => {
              form.resetFields();
              onClose();
            },
            onError: (error) => {
              console.error("Falló la petición:", error);
              message.error('No se pudo actualizar el artículo');
            }
          }
        );
      }).catch((error) => {
        console.log("Falló la validación del formulario", error);
      });
    };

    const listaAtributos = Object.entries(atributosRequeridos);

    return (
      <Modal
        title="Editar Artículo"
        open={open}
        onCancel={() => {
          form.resetFields();
          onClose();
        }}
        onOk={handleSubmit}
        confirmLoading={isPending}
        okText="Guardar Cambios"
        cancelText="Cancelar"
        destroyOnClose
      >
        {fotosHabilitadas && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <Avatar
              size={64}
              shape="square"
              icon={<PictureOutlined />}
              src={urlImagen(imagenActual)}
            />
            <Space>
              <Upload showUploadList={false} customRequest={handleSubirImagen} accept="image/jpeg,image/png,image/webp">
                <Button icon={<UploadOutlined />} loading={subiendoImagen}>
                  {imagenActual ? 'Cambiar foto' : 'Subir foto'}
                </Button>
              </Upload>
              {imagenActual && (
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  loading={borrandoImagen}
                  onClick={handleQuitarImagen}
                >
                  Quitar
                </Button>
              )}
            </Space>
          </div>
        )}

        <Form form={form} layout="vertical">

          <Form.Item name="nombre" label="Nombre del Artículo" >
            <Input />
          </Form.Item>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 24 }}>
            <Form.Item name="cantidad" label="Cantidad" rules={[{ required: true, message: 'Ingresá la cantidad' }, reglaCantidadNoNegativa]} style={{ flex: 1, marginBottom: 0 }}>
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            {/* La campana de Cantidad siempre está disponible — no hace falta
                que el inventario tenga un mínimo/máximo default para poder
                pisarle un valor puntual a este ítem. El Form.Item de arriba
                va sin su margen inferior default: "flex-end" alinea contra
                el borde de cada hijo, y ese margen corría el input hacia
                arriba dejando la campana centrada contra el hueco vacío en
                vez del input. */}
            <CampanaOverrideNotificacion
              tipo="numero"
              fieldNamePath={['notificaciones_config', 'cantidad']}
              defaultMinimo={notificacionesConfig?.cantidad?.minimo}
              defaultMaximo={notificacionesConfig?.cantidad?.maximo}
            />
          </div>

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