ALTER TABLE "NameEntry" ADD COLUMN "searchText" TEXT NOT NULL DEFAULT '';
UPDATE "NameEntry" SET "searchText" = concat_ws(' ', "label", array_to_string("aliases", ' '));
