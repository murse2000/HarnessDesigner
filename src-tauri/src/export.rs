use crate::model::{
    BomExportRow, ContinuityTestExportRow, ContinuityTestResultExportRow, CutExportRow,
    HarnessBomExportRow,
};
use rust_xlsxwriter::{Format, FormatAlign, Workbook};
use std::{fs, path::Path};

pub fn write_xlsx(
    path: &Path,
    bom: &[BomExportRow],
    harness_bom: &[HarnessBomExportRow],
    cuts: &[CutExportRow],
    tests: &[ContinuityTestExportRow],
    test_results: &[ContinuityTestResultExportRow],
) -> Result<(), String> {
    let mut workbook = Workbook::new();
    let header = Format::new()
        .set_bold()
        .set_align(FormatAlign::Center)
        .set_background_color("#DCE5EF")
        .set_border(rust_xlsxwriter::FormatBorder::Thin);
    let cell = Format::new().set_border(rust_xlsxwriter::FormatBorder::Thin);
    let number = Format::new()
        .set_border(rust_xlsxwriter::FormatBorder::Thin)
        .set_num_format("0.000");

    let sheet = workbook
        .add_worksheet()
        .set_name("전체 BOM")
        .map_err(|error| error.to_string())?;
    let headers = [
        "No.",
        "품번",
        "제조사",
        "설명",
        "분류",
        "규격",
        "단위",
        "수량",
        "적용 하네스",
    ];
    for (column, value) in headers.iter().enumerate() {
        sheet
            .write_with_format(0, column as u16, *value, &header)
            .map_err(|error| error.to_string())?;
    }
    for (index, row) in bom.iter().enumerate() {
        let r = (index + 1) as u32;
        sheet
            .write_with_format(r, 0, (index + 1) as f64, &cell)
            .map_err(|error| error.to_string())?;
        for (column, value) in [
            row.part_number.as_str(),
            row.manufacturer.as_str(),
            row.description.as_str(),
            row.category.as_str(),
            row.specification.as_str(),
            row.unit.as_str(),
        ]
        .iter()
        .enumerate()
        {
            sheet
                .write_with_format(r, (column + 1) as u16, *value, &cell)
                .map_err(|error| error.to_string())?;
        }
        sheet
            .write_with_format(r, 7, row.quantity, &number)
            .map_err(|error| error.to_string())?;
        sheet
            .write_with_format(r, 8, row.harnesses.join(", "), &cell)
            .map_err(|error| error.to_string())?;
    }
    sheet
        .set_column_width(1, 18)
        .map_err(|error| error.to_string())?;
    sheet
        .set_column_width(2, 18)
        .map_err(|error| error.to_string())?;
    sheet
        .set_column_width(3, 32)
        .map_err(|error| error.to_string())?;
    sheet
        .autofilter(0, 0, bom.len() as u32, 8)
        .map_err(|error| error.to_string())?;
    sheet
        .set_freeze_panes(1, 0)
        .map_err(|error| error.to_string())?;

    let harness_sheet = workbook
        .add_worksheet()
        .set_name("하네스별 BOM")
        .map_err(|error| error.to_string())?;
    let harness_headers = [
        "No.",
        "하네스",
        "품번",
        "제조사",
        "설명",
        "분류",
        "규격",
        "단위",
        "수량",
    ];
    for (column, value) in harness_headers.iter().enumerate() {
        harness_sheet
            .write_with_format(0, column as u16, *value, &header)
            .map_err(|error| error.to_string())?;
    }
    for (index, row) in harness_bom.iter().enumerate() {
        let r = (index + 1) as u32;
        harness_sheet
            .write_with_format(r, 0, (index + 1) as f64, &cell)
            .map_err(|error| error.to_string())?;
        for (column, value) in [
            row.harness_number.as_str(),
            row.part_number.as_str(),
            row.manufacturer.as_str(),
            row.description.as_str(),
            row.category.as_str(),
            row.specification.as_str(),
            row.unit.as_str(),
        ]
        .iter()
        .enumerate()
        {
            harness_sheet
                .write_with_format(r, (column + 1) as u16, *value, &cell)
                .map_err(|error| error.to_string())?;
        }
        harness_sheet
            .write_with_format(r, 8, row.quantity, &number)
            .map_err(|error| error.to_string())?;
    }
    harness_sheet
        .set_freeze_panes(1, 0)
        .map_err(|error| error.to_string())?;

    let cut_sheet = workbook
        .add_worksheet()
        .set_name("전선 컷리스트")
        .map_err(|error| error.to_string())?;
    let cut_headers = [
        "No.",
        "하네스",
        "전선",
        "시작",
        "종료",
        "품번",
        "색상",
        "규격",
        "길이(mm)",
        "시작 피복제거(mm)",
        "종료 피복제거(mm)",
        "메모",
    ];
    for (column, value) in cut_headers.iter().enumerate() {
        cut_sheet
            .write_with_format(0, column as u16, *value, &header)
            .map_err(|error| error.to_string())?;
    }
    for (index, row) in cuts.iter().enumerate() {
        let r = (index + 1) as u32;
        cut_sheet
            .write_with_format(r, 0, (index + 1) as f64, &cell)
            .map_err(|error| error.to_string())?;
        for (column, value) in [
            row.harness_number.as_str(),
            row.reference.as_str(),
            row.from.as_str(),
            row.to.as_str(),
            row.part_number.as_str(),
            row.color.as_str(),
            row.gauge.as_str(),
        ]
        .iter()
        .enumerate()
        {
            cut_sheet
                .write_with_format(r, (column + 1) as u16, *value, &cell)
                .map_err(|error| error.to_string())?;
        }
        cut_sheet
            .write_with_format(r, 8, row.length_mm, &number)
            .map_err(|error| error.to_string())?;
        if let Some(value) = row.start_strip_length_mm {
            cut_sheet
                .write_with_format(r, 9, value, &number)
                .map_err(|error| error.to_string())?;
        }
        if let Some(value) = row.end_strip_length_mm {
            cut_sheet
                .write_with_format(r, 10, value, &number)
                .map_err(|error| error.to_string())?;
        }
        cut_sheet
            .write_with_format(r, 11, row.notes.as_deref().unwrap_or(""), &cell)
            .map_err(|error| error.to_string())?;
    }
    cut_sheet
        .set_freeze_panes(1, 0)
        .map_err(|error| error.to_string())?;

    let test_sheet = workbook
        .add_worksheet()
        .set_name("연속성 검사표")
        .map_err(|error| error.to_string())?;
    let test_headers = [
        "No.",
        "하네스",
        "회로",
        "시작 커넥터",
        "시작 핀",
        "종료 커넥터",
        "종료 핀",
        "색상",
        "규격",
        "케이블 코어",
        "기대 결과",
        "검사 결과",
    ];
    for (column, value) in test_headers.iter().enumerate() {
        test_sheet
            .write_with_format(0, column as u16, *value, &header)
            .map_err(|error| error.to_string())?;
    }
    for (index, row) in tests.iter().enumerate() {
        let r = (index + 1) as u32;
        test_sheet
            .write_with_format(r, 0, (index + 1) as f64, &cell)
            .map_err(|error| error.to_string())?;
        for (column, value) in [
            row.harness_number.as_str(),
            row.reference.as_str(),
            row.from_connector.as_str(),
            row.from_pin.as_str(),
            row.to_connector.as_str(),
            row.to_pin.as_str(),
            row.color.as_str(),
            row.gauge.as_str(),
            row.cable_core.as_str(),
            row.expected.as_str(),
            "",
        ]
        .iter()
        .enumerate()
        {
            test_sheet
                .write_with_format(r, (column + 1) as u16, *value, &cell)
                .map_err(|error| error.to_string())?;
        }
    }
    test_sheet
        .set_column_width(1, 14)
        .map_err(|error| error.to_string())?;
    test_sheet
        .set_column_width(2, 16)
        .map_err(|error| error.to_string())?;
    test_sheet
        .set_column_width(3, 16)
        .map_err(|error| error.to_string())?;
    test_sheet
        .set_column_width(5, 16)
        .map_err(|error| error.to_string())?;
    test_sheet
        .set_freeze_panes(1, 0)
        .map_err(|error| error.to_string())?;

    let result_sheet = workbook
        .add_worksheet()
        .set_name("검사 결과")
        .map_err(|error| error.to_string())?;
    let result_headers = [
        "No.",
        "하네스",
        "Rev",
        "시리얼",
        "검사자",
        "시작 시각",
        "완료 시각",
        "회로",
        "시작 커넥터",
        "시작 핀",
        "종료 커넥터",
        "종료 핀",
        "기대 결과",
        "검사 결과",
        "메모",
    ];
    for (column, value) in result_headers.iter().enumerate() {
        result_sheet
            .write_with_format(0, column as u16, *value, &header)
            .map_err(|error| error.to_string())?;
    }
    for (index, row) in test_results.iter().enumerate() {
        let r = (index + 1) as u32;
        result_sheet
            .write_with_format(r, 0, (index + 1) as f64, &cell)
            .map_err(|error| error.to_string())?;
        for (column, value) in [
            row.harness_number.as_str(),
            row.revision.as_str(),
            row.serial_number.as_str(),
            row.operator.as_str(),
            row.started_at.as_str(),
            row.completed_at.as_str(),
            row.reference.as_str(),
            row.from_connector.as_str(),
            row.from_pin.as_str(),
            row.to_connector.as_str(),
            row.to_pin.as_str(),
            row.expected.as_str(),
            row.result.as_str(),
            row.note.as_str(),
        ]
        .iter()
        .enumerate()
        {
            result_sheet
                .write_with_format(r, (column + 1) as u16, *value, &cell)
                .map_err(|error| error.to_string())?;
        }
    }
    result_sheet
        .set_column_width(3, 18)
        .map_err(|error| error.to_string())?;
    result_sheet
        .set_column_width(5, 24)
        .map_err(|error| error.to_string())?;
    result_sheet
        .set_column_width(6, 24)
        .map_err(|error| error.to_string())?;
    result_sheet
        .set_column_width(14, 30)
        .map_err(|error| error.to_string())?;
    result_sheet
        .set_freeze_panes(1, 0)
        .map_err(|error| error.to_string())?;
    workbook.save(path).map_err(|error| error.to_string())
}

pub fn write_text(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(path, content).map_err(|error| error.to_string())
}

pub fn write_binary(path: &Path, content: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(path, content).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs::File, io::Read};
    use zip::ZipArchive;

    #[test]
    fn xlsx_contains_completed_continuity_test_results() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("manufacturing.xlsx");
        let results = vec![ContinuityTestResultExportRow {
            harness_number: "HNS-001".into(),
            revision: "A".into(),
            serial_number: "SN-001".into(),
            operator: "QA".into(),
            started_at: "2026-08-17T01:00:00Z".into(),
            completed_at: "2026-08-17T01:05:00Z".into(),
            reference: "W001".into(),
            from_connector: "J1".into(),
            from_pin: "1".into(),
            to_connector: "J2".into(),
            to_pin: "1".into(),
            expected: "CONTINUITY".into(),
            result: "pass".into(),
            note: "정상".into(),
        }];

        write_xlsx(&path, &[], &[], &[], &[], &results).unwrap();
        let mut archive = ZipArchive::new(File::open(path).unwrap()).unwrap();
        let mut workbook = String::new();
        archive
            .by_name("xl/workbook.xml")
            .unwrap()
            .read_to_string(&mut workbook)
            .unwrap();
        assert!(workbook.contains("검사 결과"));
        let mut strings = String::new();
        archive
            .by_name("xl/sharedStrings.xml")
            .unwrap()
            .read_to_string(&mut strings)
            .unwrap();
        assert!(strings.contains("SN-001"));
        assert!(strings.contains("pass"));
    }
}
