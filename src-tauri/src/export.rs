use crate::model::{BomExportRow, CutExportRow, HarnessBomExportRow};
use rust_xlsxwriter::{Format, FormatAlign, Workbook};
use std::{fs, path::Path};

pub fn write_xlsx(path: &Path, bom: &[BomExportRow], harness_bom: &[HarnessBomExportRow], cuts: &[CutExportRow]) -> Result<(), String> {
    let mut workbook = Workbook::new();
    let header = Format::new().set_bold().set_align(FormatAlign::Center).set_background_color("#DCE5EF").set_border(rust_xlsxwriter::FormatBorder::Thin);
    let cell = Format::new().set_border(rust_xlsxwriter::FormatBorder::Thin);
    let number = Format::new().set_border(rust_xlsxwriter::FormatBorder::Thin).set_num_format("0.000");

    let sheet = workbook.add_worksheet().set_name("전체 BOM").map_err(|error| error.to_string())?;
    let headers = ["No.", "품번", "제조사", "설명", "분류", "규격", "단위", "수량", "적용 하네스"];
    for (column, value) in headers.iter().enumerate() { sheet.write_with_format(0, column as u16, *value, &header).map_err(|error| error.to_string())?; }
    for (index, row) in bom.iter().enumerate() {
        let r = (index + 1) as u32;
        sheet.write_with_format(r, 0, (index + 1) as f64, &cell).map_err(|error| error.to_string())?;
        for (column, value) in [row.part_number.as_str(), row.manufacturer.as_str(), row.description.as_str(), row.category.as_str(), row.specification.as_str(), row.unit.as_str()].iter().enumerate() {
            sheet.write_with_format(r, (column + 1) as u16, *value, &cell).map_err(|error| error.to_string())?;
        }
        sheet.write_with_format(r, 7, row.quantity, &number).map_err(|error| error.to_string())?;
        sheet.write_with_format(r, 8, row.harnesses.join(", "), &cell).map_err(|error| error.to_string())?;
    }
    sheet.set_column_width(1, 18).map_err(|error| error.to_string())?;
    sheet.set_column_width(2, 18).map_err(|error| error.to_string())?;
    sheet.set_column_width(3, 32).map_err(|error| error.to_string())?;
    sheet.autofilter(0, 0, bom.len() as u32, 8).map_err(|error| error.to_string())?;
    sheet.set_freeze_panes(1, 0).map_err(|error| error.to_string())?;

    let harness_sheet = workbook.add_worksheet().set_name("하네스별 BOM").map_err(|error| error.to_string())?;
    let harness_headers = ["No.", "하네스", "품번", "제조사", "설명", "분류", "규격", "단위", "수량"];
    for (column, value) in harness_headers.iter().enumerate() { harness_sheet.write_with_format(0, column as u16, *value, &header).map_err(|error| error.to_string())?; }
    for (index, row) in harness_bom.iter().enumerate() {
        let r = (index + 1) as u32;
        harness_sheet.write_with_format(r, 0, (index + 1) as f64, &cell).map_err(|error| error.to_string())?;
        for (column, value) in [row.harness_number.as_str(), row.part_number.as_str(), row.manufacturer.as_str(), row.description.as_str(), row.category.as_str(), row.specification.as_str(), row.unit.as_str()].iter().enumerate() {
            harness_sheet.write_with_format(r, (column + 1) as u16, *value, &cell).map_err(|error| error.to_string())?;
        }
        harness_sheet.write_with_format(r, 8, row.quantity, &number).map_err(|error| error.to_string())?;
    }
    harness_sheet.set_freeze_panes(1, 0).map_err(|error| error.to_string())?;

    let cut_sheet = workbook.add_worksheet().set_name("전선 컷리스트").map_err(|error| error.to_string())?;
    let cut_headers = ["No.", "하네스", "전선", "시작", "종료", "품번", "색상", "규격", "길이(mm)"];
    for (column, value) in cut_headers.iter().enumerate() { cut_sheet.write_with_format(0, column as u16, *value, &header).map_err(|error| error.to_string())?; }
    for (index, row) in cuts.iter().enumerate() {
        let r = (index + 1) as u32;
        cut_sheet.write_with_format(r, 0, (index + 1) as f64, &cell).map_err(|error| error.to_string())?;
        for (column, value) in [row.harness_number.as_str(), row.reference.as_str(), row.from.as_str(), row.to.as_str(), row.part_number.as_str(), row.color.as_str(), row.gauge.as_str()].iter().enumerate() {
            cut_sheet.write_with_format(r, (column + 1) as u16, *value, &cell).map_err(|error| error.to_string())?;
        }
        cut_sheet.write_with_format(r, 8, row.length_mm, &number).map_err(|error| error.to_string())?;
    }
    cut_sheet.set_freeze_panes(1, 0).map_err(|error| error.to_string())?;
    workbook.save(path).map_err(|error| error.to_string())
}

pub fn write_text(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
    fs::write(path, content).map_err(|error| error.to_string())
}

pub fn write_binary(path: &Path, content: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
    fs::write(path, content).map_err(|error| error.to_string())
}
