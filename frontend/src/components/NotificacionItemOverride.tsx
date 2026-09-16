import React from 'react';
import { Popover, Form, InputNumber, Button, Checkbox } from 'antd';
import { BellOutlined, BellFilled } from '@ant-design/icons';
import type { NotificacionesConfig } from '../api/inventory.service';

// El form guarda una entrada por cada atributo notificable que el modal
// renderiza, aunque el usuario no haya tocado nada (los inputs vacíos igual
// aparecen como {} en el value del Form.Item) — hay que descartar esas antes
// de mandar el payload, o el backend rechaza el override vacío con "hay que
// indicar al menos un mínimo o máximo".
export function limpiarNotificacionesOverrideItem(raw: NotificacionesConfig | undefined): NotificacionesConfig {
  const limpio: NotificacionesConfig = {};

  const atributosLimpios: NonNullable<NotificacionesConfig['atributos']> = {};
  Object.entries(raw?.atributos || {}).forEach(([nombre, bloque]) => {
    const b = bloque as any;
    if (b?.recordatorio_dias != null || b?.minimo != null || b?.maximo != null) {
      atributosLimpios[nombre] = bloque;
    }
  });
  if (Object.keys(atributosLimpios).length > 0) limpio.atributos = atributosLimpios;

  const cantidad = raw?.cantidad as any;
  if (cantidad && (cantidad.minimo != null || cantidad.maximo != null)) {
    limpio.cantidad = cantidad;
  }

  return limpio;
}

// Campana de override puntual de notificaciones para UN ítem, usada tanto en
// ModalAddItemInventory como en ModalEditItemInventory (de ahí que viva
// aparte en vez de duplicarse en los dos). Lo que el usuario no fija acá cae
// al default del inventario — placeholder = valor del inventario, así queda
// claro qué pasa si se deja en blanco.
//
// Se apoya en que el componente se renderiza DENTRO del <Form> del modal:
// Form.useWatch(namePath) sin pasar `form` toma la instancia del contexto
// más cercano.

interface Props {
  tipo: 'fecha' | 'numero';
  fieldNamePath: (string | number)[];
  defaultRecordatorioDias?: number;
  defaultMinimo?: number | null;
  defaultMaximo?: number | null;
}

export const CampanaOverrideNotificacion: React.FC<Props> = ({
  tipo,
  fieldNamePath,
  defaultRecordatorioDias,
  defaultMinimo,
  defaultMaximo,
}) => {
  const form = Form.useFormInstance();
  const valorActual = Form.useWatch(fieldNamePath, { form, preserve: true }) as
    | { recordatorio_dias?: number | null; minimo?: number | null; maximo?: number | null }
    | undefined;

  const tieneOverride = tipo === 'fecha'
    ? valorActual?.recordatorio_dias != null
    : (valorActual?.minimo != null || valorActual?.maximo != null);

  return (
    <Popover
      trigger="click"
      title="Para este ítem..."
      forceRender
      content={
        <div style={{ width: 240 }}>
          {tipo === 'fecha' ? (
            <>
              {/* El checkbox es el override en sí: tildado = "recordatorio_dias"
                  tiene un valor (arranca en 0, avisar el mismo día) y el campo
                  se destraba; destildado limpia el campo → sin override, cae
                  al default del inventario. */}
              <Checkbox
                checked={valorActual?.recordatorio_dias != null}
                onChange={(e) => {
                  form.setFieldValue([...fieldNamePath, 'recordatorio_dias'], e.target.checked ? 0 : undefined);
                }}
                style={{ marginBottom: valorActual?.recordatorio_dias != null ? 8 : 0 }}
              >
                Avisarme cuando llegue esta fecha
              </Checkbox>
              {valorActual?.recordatorio_dias == null && defaultRecordatorioDias != null && (
                <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginBottom: 0 }}>
                  Sin tildar, se usa el del inventario ({defaultRecordatorioDias} día(s))
                </div>
              )}
              {valorActual?.recordatorio_dias != null && (
                <Form.Item
                  name={[...fieldNamePath, 'recordatorio_dias']}
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
              <Form.Item name={[...fieldNamePath, 'minimo']} label="Mínimo" style={{ marginBottom: 8 }}>
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder={defaultMinimo != null ? `Inventario: ${defaultMinimo}` : 'Sin mínimo'}
                />
              </Form.Item>
              <Form.Item name={[...fieldNamePath, 'maximo']} label="Máximo" style={{ marginBottom: 0 }}>
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder={defaultMaximo != null ? `Inventario: ${defaultMaximo}` : 'Sin máximo'}
                />
              </Form.Item>
            </>
          )}
        </div>
      }
    >
      <Button
        type="text"
        size="small"
        icon={tieneOverride ? <BellFilled style={{ color: '#1677ff' }} /> : <BellOutlined />}
      />
    </Popover>
  );
};
