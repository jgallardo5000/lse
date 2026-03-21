Esquema de la base de datos postgre

-- DROP SCHEMA public;

CREATE SCHEMA public AUTHORIZATION postgres;

COMMENT ON SCHEMA public IS 'standard public schema';

-- DROP SEQUENCE public.coprar_lsp_equipamientos_id_seq;

CREATE SEQUENCE public.coprar_lsp_equipamientos_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.equipamientos_escala_id_seq;

create table coprar_lsp_datos (
	id serial primary key,
    id_equipamiento  int8,
    numdoc varchar (45),
    peso int8
	);


CREATE SEQUENCE public.equipamientos_escala_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.partidas_equipamiento_id_seq;

CREATE SEQUENCE public.partidas_equipamiento_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.taras_id_seq;

CREATE SEQUENCE public.taras_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;-- public.coprar_lsp_equipamientos definition

-- Drop table

-- DROP TABLE public.coprar_lsp_equipamientos;

CREATE TABLE public.coprar_lsp_equipamientos (
	id serial4 NOT NULL,
	escala int8 NULL,
	equipamiento varchar(15) NULL,
	estado varchar(10) NULL,
	CONSTRAINT coprar_lsp_equipamientos_pkey PRIMARY KEY (id)
);


-- public.equipamientos_escala definition

-- Drop table

-- DROP TABLE public.equipamientos_escala;

CREATE TABLE public.equipamientos_escala (
	id serial4 NOT NULL,
	id_lista int8 NULL,
	escala int8 NULL,
	equipamiento varchar(15) NULL,
	tipo varchar(8) NULL,
	peso int8 NULL,
	tara int4 NULL,
	CONSTRAINT equipamientos_escala_pkey PRIMARY KEY (id)
);


-- public.partidas_equipamiento definition

-- Drop table

-- DROP TABLE public.partidas_equipamiento;

CREATE TABLE public.partidas_equipamiento (
	id serial4 NOT NULL,
	fecha_alta timestamp NULL,
	id_documento_partida varchar(50) NULL,
	peso int8 NULL,
	tipo_documento varchar(10) NULL,
	fecha_evento timestamp NULL,
	nombre_evento varchar(40) NULL,
	equipamiento varchar NULL,
	idlista int8 NULL,
	escala int8 NULL,
	CONSTRAINT partidas_equipamiento_pkey PRIMARY KEY (id)
);


-- public.taras definition

-- Drop table

-- DROP TABLE public.taras;

CREATE TABLE public.taras (
	id serial4 NOT NULL,
	tipo varchar(8) NOT NULL,
	teu int4 NULL,
	peso int4 NULL,
	CONSTRAINT taras_pkey PRIMARY KEY (id)
);
CREATE INDEX taras_tipo_idx ON public.taras USING btree (tipo);


-- public.equipamientos_escala_peso source

CREATE OR REPLACE VIEW public.equipamientos_escala_peso
AS SELECT ee.escala,
    ee.equipamiento,
    ee.peso - ee.tara AS pesoneto
   FROM equipamientos_escala ee;


-- public.partidas_equipamiento_peso source

CREATE OR REPLACE VIEW public.partidas_equipamiento_peso
AS SELECT pe.id_documento_partida,
    sum(pe.peso) AS sum
   FROM partidas_equipamiento pe
  GROUP BY pe.id_documento_partida;