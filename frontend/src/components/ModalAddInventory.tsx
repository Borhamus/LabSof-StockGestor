import React from 'react';
import { Modal, Form, Input, InputNumber, Button, Space, Select, Checkbox, AutoComplete, Popover, theme } from 'antd';
import { MinusCircleOutlined, PlusOutlined, BellOutlined, BellFilled } from '@ant-design/icons';
import { useCreateInventory, useConfigurarRoles, useConfigurarNotificaciones } from '../hooks/useInventory';
import type { NotificacionesConfig } from '../api/inventory.service';

// Nombre fijo del atributo que arma el checkbox de vencimiento. Si el
// usuario ya definió a mano un atributo con este mismo nombre, se
// sobrescribe como "date" — es la intención explícita de tildar la casilla.
const ATRIBUTO_VENCIMIENTO = 'Vencimiento';

const TIPO_OPTIONS = [
  { value: 'string',  label: 'Texto' },
  { value: 'integer', label: 'Número entero' },
  { value: 'natural', label: 'Número natural (0 o mayor)' },
  { value: 'float',   label: 'Número decimal' },
  { value: 'boolean', label: 'Booleano' },
  { value: 'date',    label: 'Fecha' },
];

const TIPOS_NUMERICOS_UNIDAD = new Set(['integer', 'natural', 'float']);
const UNIDADES_SUGERIDAS = ['$', 'USD', '€', 'kg', 'g', 'L', 'm', 'cm', 'm³', 'un'];

// Mismo criterio que ModalEditInventory: solo fecha/entero/natural/decimal
// tienen semántica de "vencimiento" o "rango" — string/boolean no ofrecen
// campana.
const TIPOS_NOTIFICABLES = new Set(['date', 'integer', 'natural', 'float']);

interface AtributoNotificacionFormValue {
  recordatorio_dias?: number | null;
  minimo?: number | null;
  maximo?: number | null;
}

const tieneNotificacionCargada = (tipo: string | undefined, notif: AtributoNotificacionFormValue | undefined): boolean => {
  if (!notif) return false;
  if (tipo === 'date') return notif.recordatorio_dias !== undefined && notif.recordatorio_dias !== null;
  return notif.minimo !== undefined && notif.minimo !== null || notif.maximo !== undefined && notif.maximo !== null;
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export const ModalAddInventory: React.FC<Props> = ({ open, onClose }) => {
  const [form] = Form.useForm();
  const { token } = theme.useToken();

  const { mutate: createInventory, isPending } = useCreateInventory();
  const { mutate: configurarRoles, isPending: isPendingRoles } = useConfigurarRoles();
  const { mutate: configurarNotificaciones, isPending: isPendingNotificaciones } = useConfigurarNotificaciones();

  // Solo se ve si "tiene_vencimiento" está tildado — sin fecha, no hay nada
  // que recordar. Roles Especiales completos siguen quedando para Editar
  // Inventario (necesita un inventario con ID) — pero la notificación por
  // atributo y la de Cantidad ya se pueden cargar acá mismo, encadenadas
  // después de crear (mismo mecanismo que ya usaba el atajo de vencimiento).
  // Junto con el checkbox de vencimiento (ver el bloque comentado en el JSX).
  // const tieneVencimientoWatch = Form.useWatch('tiene_vencimiento', form);
  const atributosDinamicosWatch: { llave?: string; tipo?: string; unidad?: string; notificacion?: AtributoNotificacionFormValue }[] =
    Form.useWatch('atributos_dinamicos', form) || [];

  const handleSubmit = () => {
    form.validateFields().then((values) => {

      const atributosFormateados: Record<string, string> = {};
      const unidades: Record<string, string> = {};
      const notificacionesAtributos: NonNullable<NotificacionesConfig['atributos']> = {};
      if (values.atributos_dinamicos) {
        values.atributos_dinamicos.forEach((item: { llave: string; tipo: string; unidad?: string; notificacion?: AtributoNotificacionFormValue }) => {
          if (!item?.llave) return;
          atributosFormateados[item.llave] = item.tipo;

          const simbolo = item.unidad?.trim();
          if (simbolo && TIPOS_NUMERICOS_UNIDAD.has(item.tipo)) {
            unidades[item.llave] = simbolo;
          }

          if (!item.tipo || !TIPOS_NOTIFICABLES.has(item.tipo)) return;
          if (!tieneNotificacionCargada(item.tipo, item.notificacion)) return;
          if (item.tipo === 'date') {
            notificacionesAtributos[item.llave] = {
              tipo: 'fecha',
              recordatorio_dias: item.notificacion!.recordatorio_dias!,
            };
          } else {
            notificacionesAtributos[item.llave] = {
              tipo: 'numero',
              minimo: item.notificacion?.minimo ?? undefined,
              maximo: item.notificacion?.maximo ?? undefined,
            };
          }
        });
      }

      // El checkbox agrega el atributo de vencimiento y, después de crear el
      // inventario, le asigna el rol fecha_reposicion — es un atajo de UI
      // sobre dos pasos que ya existían por separado (agregar atributo +
      // "Roles Especiales" en Editar Inventario), no un concepto nuevo.
      const tieneVencimiento = Boolean(values.tiene_vencimiento);
      if (tieneVencimiento) {
        atributosFormateados[ATRIBUTO_VENCIMIENTO] = 'date';
      }
      // Mismo atajo para la notificación: si tildó "Notificarme cuando
      // venza", se pisa (o agrega) la campana de ese atributo con los días
      // de recordatorio que eligió — gana por sobre una campana manual que
      // el usuario le haya puesto a un atributo que también llamó "Vencimiento".
      const notificarVencimiento = tieneVencimiento && Boolean(values.notificar_vencimiento);
      if (notificarVencimiento) {
        notificacionesAtributos[ATRIBUTO_VENCIMIENTO] = {
          tipo: 'fecha',
          recordatorio_dias: values.recordatorio_dias ?? 7,
        };
      }

      const notificacionesConfig: NotificacionesConfig = {};
      if (Object.keys(notificacionesAtributos).length > 0) notificacionesConfig.atributos = notificacionesAtributos;
      const cantidadNotif = values.cantidad_notificacion;
      if (cantidadNotif && (cantidadNotif.minimo != null || cantidadNotif.maximo != null)) {
        notificacionesConfig.cantidad = { minimo: cantidadNotif.minimo ?? undefined, maximo: cantidadNotif.maximo ?? undefined };
      }
      const hayNotificaciones = Boolean(notificacionesConfig.atributos || notificacionesConfig.cantidad);

      const payloadFinal = {
        nombre:      values.nombre,
        descripcion: values.descripcion,
        atributos:   atributosFormateados,
        unidades,
        fotos_habilitadas: Boolean(values.fotos_habilitadas),
      };

      const finalizar = () => {
        form.resetFields();
        onClose();
      };

      const configurarNotificacionSiCorresponde = (inventarioId: number) => {
        if (!hayNotificaciones) {
          finalizar();
          return;
        }
        configurarNotificaciones(
          { id: inventarioId, notificaciones_config: notificacionesConfig },
          {
            onSuccess: finalizar,
            onError: (error) => {
              // El inventario (y el rol, si correspondía) ya se guardaron —
              // solo falló el paso extra de la notificación. Se puede
              // configurar a mano después desde Editar Inventario.
              console.error('El inventario se creó, pero falló configurar las notificaciones', error);
              finalizar();
            },
          }
        );
      };

      createInventory(payloadFinal, {
        onSuccess: (nuevoInventario) => {
          if (tieneVencimiento && nuevoInventario?.id) {
            configurarRoles(
              { id: nuevoInventario.id, roles_atributos: { fecha_reposicion: ATRIBUTO_VENCIMIENTO } },
              {
                onSuccess: () => configurarNotificacionSiCorresponde(nuevoInventario.id),
                onError: (error) => {
                  // El inventario ya se creó — solo falló el paso extra de
                  // asignar el rol. Se puede configurar a mano después desde
                  // "Roles Especiales" en Editar Inventario.
                  console.error('El inventario se creó, pero falló configurar el rol de vencimiento', error);
                  finalizar();
                },
              }
            );
          } else if (nuevoInventario?.id) {
            configurarNotificacionSiCorresponde(nuevoInventario.id);
          } else {
            finalizar();
          }
        },
        onError: (error) => {
          console.error("Falló el POST", error);
        }
      });
    }).catch((error) => {
      console.log("Validación fallida", error);
    });
  };

  return (
    <Modal
      title="Crear Nuevo Inventario"
      open={open}
      onOk={handleSubmit}
      onCancel={onClose}
      okText={isPending || isPendingRoles || isPendingNotificaciones ? "Creando..." : "Crear"}
      cancelText="Cancelar"
      confirmLoading={isPending || isPendingRoles || isPendingNotificaciones}
      destroyOnClose
    >
      <p style={{ marginBottom: 20, color: token.colorTextSecondary }}>
        Define los detalles del inventario y los atributos base que tendrán sus artículos.
      </p>

      <Form form={form} layout="vertical">
        <Form.Item
          label="Nombre del Inventario"
          name="nombre"
          rules={[{ required: true, message: 'El nombre es obligatorio' }]}
        >
          <Input placeholder="Ej: Depósito Central" size="large" />
        </Form.Item>

        <Form.Item label="Descripción" name="descripcion">
          <Input.TextArea rows={2} placeholder="Detalles opcionales..." />
        </Form.Item>

        {/* Atajo de "fecha de vencimiento" — oculto, no borrado. Tildarlo
            agregaba el atributo "Vencimiento" (date), le asignaba el rol
            fecha_reposicion al crear y, con el segundo checkbox, le dejaba
            configurada la campana. Todo eso se puede hacer igual a mano:
            agregar el atributo de tipo Fecha acá abajo con su campana, y el
            rol desde "Roles Especiales" en Editar Inventario. La lógica que
            lo procesa sigue en handleSubmit y queda inerte mientras el campo
            no exista (values.tiene_vencimiento es undefined), así que para
            volver atrás alcanza con descomentar este bloque y el
            Form.useWatch de tiene_vencimiento.

        <Form.Item name="tiene_vencimiento" valuePropName="checked" style={{ marginBottom: 4 }}>
          <Checkbox>
            Los artículos de este inventario tienen fecha de vencimiento
          </Checkbox>
        </Form.Item>
        <p style={{ fontSize: '12px', color: token.colorTextTertiary, marginTop: 0, marginBottom: tieneVencimientoWatch ? 8 : 20, paddingLeft: 24 }}>
          Se va a pedir la fecha de vencimiento a cada artículo que cargues, y vas a poder ver desde el inicio cuáles están por vencer o ya vencieron.
        </p>

        {tieneVencimientoWatch && (
          <div style={{ paddingLeft: 24, marginBottom: 20 }}>
            <Form.Item name="notificar_vencimiento" valuePropName="checked" style={{ marginBottom: 4 }}>
              <Checkbox>Notificarme cuando venza</Checkbox>
            </Form.Item>
            <Form.Item
              name="recordatorio_dias"
              label="Avisarme con cuántos días de anticipación"
              initialValue={7}
              style={{ marginBottom: 0, maxWidth: 260 }}
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        )}
        */}

        <Form.Item name="fotos_habilitadas" valuePropName="checked" style={{ marginBottom: 4 }}>
          <Checkbox>
            Los artículos de este inventario van a tener foto
          </Checkbox>
        </Form.Item>
        <p style={{ fontSize: '12px', color: token.colorTextTertiary, marginTop: 0, marginBottom: 20, paddingLeft: 24 }}>
          Si no lo tildás, no se te va a pedir ni mostrar el campo de foto en los artículos — lo podés cambiar después desde Editar Inventario.
        </p>

        <div style={{
          padding:      '16px',
          background:   token.colorFillAlter,
          borderRadius: token.borderRadiusLG,
          marginBottom: '24px',
          border:       `1px solid ${token.colorBorderSecondary}`,
        }}>
          <h4 style={{ marginTop: 0, marginBottom: 8, color: token.colorText }}>
            Atributos del Inventario
          </h4>
          <p style={{ fontSize: '12px', color: token.colorTextTertiary, marginBottom: 16 }}>
            Definí qué datos se le pedirán a cada artículo (ej: Color, Talle, Material).
          </p>

          <Form.List name="atributos_dinamicos">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => {
                  const tipoActual = atributosDinamicosWatch[name]?.tipo;
                  const notifActual = atributosDinamicosWatch[name]?.notificacion;
                  const puedeNotificar = tipoActual !== undefined && TIPOS_NOTIFICABLES.has(tipoActual);
                  const notificacionCargada = tieneNotificacionCargada(tipoActual, notifActual);
                  return (
                    <Space key={key} style={{ display: 'flex', marginBottom: 8, flexWrap: 'wrap', rowGap: 8 }} align="baseline">
                      <Form.Item
                        {...restField}
                        name={[name, 'llave']}
                        rules={[{ required: true, message: 'Ingresá el nombre' }]}
                        style={{ margin: 0 }}
                      >
                        <Input
                          placeholder="Nombre (ej: Color)"
                          style={{ width: '180px' }}
                        />
                      </Form.Item>
                      <Form.Item
                        {...restField}
                        name={[name, 'tipo']}
                        rules={[{ required: true, message: 'Elegí un tipo' }]}
                        style={{ margin: 0 }}
                      >
                        <Select
                          placeholder="Tipo"
                          style={{ width: '150px' }}
                          options={TIPO_OPTIONS}
                        />
                      </Form.Item>
                      {TIPOS_NUMERICOS_UNIDAD.has(tipoActual ?? '') && (
                        <Form.Item
                          {...restField}
                          name={[name, 'unidad']}
                          style={{ margin: 0 }}
                          normalize={(valor) => (typeof valor === 'string' ? valor.slice(0, 8) : valor)}
                        >
                          <AutoComplete
                            options={UNIDADES_SUGERIDAS.map((u) => ({ value: u }))}
                            style={{ width: '110px' }}
                            placeholder="Unidad ($, kg…)"
                          />
                        </Form.Item>
                      )}
                      {puedeNotificar && (
                        <Popover
                          trigger="click"
                          title="Notificarme cuando..."
                          forceRender
                          content={
                            <div style={{ width: 240 }}>
                              {tipoActual === 'date' ? (
                                <>
                                  <Checkbox
                                    checked={notifActual?.recordatorio_dias != null}
                                    onChange={(e) => {
                                      form.setFieldValue(
                                        ['atributos_dinamicos', name, 'notificacion', 'recordatorio_dias'],
                                        e.target.checked ? 0 : undefined
                                      );
                                    }}
                                    style={{ marginBottom: notifActual?.recordatorio_dias != null ? 8 : 0 }}
                                  >
                                    Avisar cuando llegue esta fecha
                                  </Checkbox>
                                  {notifActual?.recordatorio_dias != null && (
                                    <Form.Item
                                      name={[name, 'notificacion', 'recordatorio_dias']}
                                      label="¿Con cuántos días de anticipación?"
                                      style={{ marginBottom: 0 }}
                                      tooltip="0 = avisar recién el mismo día"
                                    >
                                      <InputNumber min={0} style={{ width: '100%' }} />
                                    </Form.Item>
                                  )}
                                </>
                              ) : (
                                <>
                                  <Form.Item name={[name, 'notificacion', 'minimo']} label="Mínimo" style={{ marginBottom: 8 }}>
                                    <InputNumber style={{ width: '100%' }} placeholder="Sin mínimo" />
                                  </Form.Item>
                                  <Form.Item name={[name, 'notificacion', 'maximo']} label="Máximo" style={{ marginBottom: 0 }}>
                                    <InputNumber style={{ width: '100%' }} placeholder="Sin máximo" />
                                  </Form.Item>
                                </>
                              )}
                            </div>
                          }
                        >
                          <Button
                            type="text"
                            size="small"
                            icon={notificacionCargada ? <BellFilled style={{ color: token.colorPrimary }} /> : <BellOutlined />}
                          />
                        </Popover>
                      )}
                      <MinusCircleOutlined
                        onClick={() => remove(name)}
                        style={{ color: token.colorError, marginLeft: '8px' }}
                      />
                    </Space>
                  );
                })}

                <Form.Item style={{ marginBottom: 0, marginTop: fields.length ? 8 : 0 }}>
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                    Agregar Atributo
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>
        </div>

        <div style={{
          padding:      '16px',
          background:   token.colorFillAlter,
          borderRadius: token.borderRadiusLG,
          border:       `1px solid ${token.colorBorderSecondary}`,
        }}>
          <h4 style={{ marginTop: 0, marginBottom: 4, color: token.colorText }}>
            <BellOutlined /> Notificación de stock (opcional)
          </h4>
          <p style={{ fontSize: '12px', color: token.colorTextTertiary, marginBottom: 16 }}>
            Avisa cuando la Cantidad de un ítem de este inventario salga de este rango.
          </p>
          <Space>
            <Form.Item name={['cantidad_notificacion', 'minimo']} label="Mínimo" style={{ marginBottom: 0 }}>
              <InputNumber min={0} placeholder="Sin mínimo" />
            </Form.Item>
            <Form.Item name={['cantidad_notificacion', 'maximo']} label="Máximo" style={{ marginBottom: 0 }}>
              <InputNumber min={0} placeholder="Sin máximo" />
            </Form.Item>
          </Space>
        </div>
      </Form>
    </Modal>
  );
};
