Quiero hacer un programa que me ayude hacer un proceso q
Descirpcion
Ha de cargar datos de una base de datos oracle. 
Esto son los datos de conexión:
host orap01-vip.portic.net port 1521
database portic service name
usernname consulta
password 52.Vival

y rellene cargando datos en mi postgres local en la base de datos lse y el usuario es el postgres

esta es la estructura de postgres

CREATE TABLE taras(
    id        SERIAL PRIMARY KEY,
    tipo    VARCHAR(8) NOT NULL,
    teu     int,
    peso    integer
);

create table equipamientos_escala(
	id serial primary key,
	id_lista  int8,
	escala int,
	equipamiento varchar(15),
	tipo varchar(8),
	peso int8,
	tara int4
)

create table partidas_equipamiento(
   id serial primary key,
   fecha_alta tiemestamp,
   id_documento_partida varchar(50),
   peso int8,
   tipo_documento varchar (10),
   fecha_evento timestamp,
   nombre_evento varchar(40)
)


create table coprar_lsp_equipamientos(
    id serial primary key,
    escala int,
    equipamiento varchar (15),
    estado varchar (10)
	)

1. El primer paso es recuperar del oracle con un select para recuperar unos datos de ejemplo.
SELECT cm.ID_INTERNO, cm.MESSAGE_DATE,cm.PORT_CALL_NUMBER,CM.NUM_CONTENEDORES 
FROM PORTIC.COPRAR_MENSAJES cm 
WHERE 
cm.RECEIVER_UNB ='ESQ0817002I' and
cm.CONTAINER_LIST_TYPE ='121' AND 
cm.CONTAINER_LIST_TARGET ='COPORD' AND
cm.ESTADO ='OKSI' AND 
cm.MESSAGE_DATE > SYSDATE -1
AND ROWNUM < 10

Muestra me los resultados en una tabla.

2. Pregurtame cual ese ID_INTERNO QUE voy a utilizar ? y lo incoroporar en la select siguente para hacer el resultado Y Me preguntas el PORT_CALL_NUMBER y me preguntas cuantos registros quiero incorporar.

SELECT ce.EQUIPMENT_ID_NUMBER,ce.EQUIPMENT_TYPE,ce.VGM_PESO_VERIFICADO 
FROM PORTIC.COPRAR_EQUIPAMIENTOS ce 
WHERE ce.ID_INTERNO =${Id_interno} AND CE.FULL_EMPTY_INDICATOR = 5 AND CE.VGM_PESO_VERIFICADO IS NOT NULL

con resultado me llenaas la tabla postgres equipamientos_escala haz el siguente mapeo.

	escala = PORT_CALL_NUMBER
	equipamiento = ce.EQUIPMENT_ID_NUMBER
	tipo = ce.EQUIPMENT_TYPE
	peso = CE.VGM_PESO_VERIFICADO
	Acualizar el campo tara de la tabla equipamientos_escala de cada uno de los buscando el peso en la tabla postgres llamada taras haciendo un busqueda por tipo  y incorporando el peso.

Si antes de empezar el paso 2 hubiera registros en la tabla de la escala haz un DELETE FROM EQUIPAMIENTO WHERE ESCALA= PORT_CALL_NUMBER


3. Vamos a recorrer la tabla equipamientos_escala fijando en escala el valor port_Call_numbere

haz la query en oracle pasando como parametro el equipamiento

SELECT td.ID,td.FECHA_ALTA,td.NUM_DOC , tp.NUM_PAR,tp.PESO_B,te.ID_EQUIPAMIENTO, ttd.TIPO,ted.NOMBRE,te2.FECHA_EVENTO, tce.NOMBRE_EVENTO     
FROM portic.TDA_EQUIPAMIENTOS te, portic.TDA_PARTIDAS tp,portic.TDA_DOCUMENTOS td, portic.TDA_TIPO_DOCUMENTO ttd, portic.TDA_ESTAT_DOCUMENTO ted ,portic.TDA_EVENTOS te2,portic.TDA_CODIGOS_EVENTO tce  
WHERE te.ID_EQUIPAMIENTO ='CMAU6595343' AND td.FECHA_ALTA > ADD_MONTHS(SYSDATE, -3) and
tp.ID = te.TDA_PARTIDASID AND
td.ID = tp.TDA_DOCUMENTOSID AND 
td.REC_ENVIO LIKE '0812%' AND td.TDA_TIPO_DOCUMENTOID   IN (1,2,5,8,6)  AND 
ttd.ID = td.TDA_TIPO_DOCUMENTOID AND
ted.ID = td.TDA_ESTAT_DOCUMENTOID AND 
te2.TDA_DOCUMENTOSID = td.ID AND 
tce.ID = te2.TDA_CODIGOS_EVENTOID 
ORDER BY te2.FECHA_EVENTO DESC

con el resultado llenamos tabla postgres partida_equipamientos
   fecha_alta = td.FECHA_ALTA
   id_documento_partida = td.ID
   peso = tp.PESO
   tipo_documento = ttd.Tipo
   fecha_evento = te2.fecha_evento
   nombre_evento tce.nombre_evento
